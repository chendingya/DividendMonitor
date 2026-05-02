import { EndpointRegistry } from '@main/infrastructure/dataSources/registry/endpointRegistry'
import { PolicyEngine } from '@main/infrastructure/dataSources/policy/policyEngine'
import { CapabilityRouter } from '@main/infrastructure/dataSources/router/capabilityRouter'
import { HttpTransport } from '@main/infrastructure/dataSources/transport/httpTransport'
import { RequestCache } from '@main/infrastructure/dataSources/cache/requestCache'
import { SourceHealthRegistry } from '@main/infrastructure/dataSources/health/sourceHealthRegistry'
import { ConcurrencyLimiter } from '@main/infrastructure/dataSources/guards/concurrencyLimiter'
import { CircuitBreaker } from '@main/infrastructure/dataSources/guards/circuitBreaker'
import { RateLimiter } from '@main/infrastructure/dataSources/guards/rateLimiter'
import { SourceError, toSourceError } from '@main/infrastructure/dataSources/types/sourceErrors'
import type {
  ProviderKey,
  RequestPolicy,
  SourceRequest,
  SourceResponse
} from '@main/infrastructure/dataSources/types/sourceTypes'

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${key}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export class SourceGateway {
  private readonly inFlightRequests = new Map<string, Promise<SourceResponse<unknown>>>()

  constructor(
    private readonly registry: EndpointRegistry = new EndpointRegistry(),
    private readonly router: CapabilityRouter = new CapabilityRouter(),
    private readonly policyEngine: PolicyEngine = new PolicyEngine(),
    private readonly transport: HttpTransport = new HttpTransport(),
    private readonly cache: RequestCache = new RequestCache(),
    private readonly healthRegistry: SourceHealthRegistry = new SourceHealthRegistry(),
    private readonly limiter: ConcurrencyLimiter = new ConcurrencyLimiter(4),
    private readonly circuitBreaker: CircuitBreaker = new CircuitBreaker(),
    private readonly rateLimiter: RateLimiter = new RateLimiter()
  ) {}

  async request<TInput, TOutput>(request: SourceRequest<TInput>): Promise<SourceResponse<TOutput>> {
    const policy = this.resolvePolicy(request)
    const routePlan = this.router.resolve(request.capability, request.routeContext)
    const providers = this.buildProviderChain(request, routePlan)
    const dedupeKey = this.buildDedupeKey(request, providers)
    const cacheKey = this.cache.buildKey(request as SourceRequest<unknown>)

    const freshCache = this.cache.getFresh<TOutput>(cacheKey, policy.cacheTtlMs)
    if (freshCache) {
      return freshCache
    }

    if (!policy.useInFlightDedupe) {
      return await this.executeRequest<TInput, TOutput>(request, providers, policy, cacheKey)
    }

    const existing = this.inFlightRequests.get(dedupeKey)
    if (existing) {
      return await existing as unknown as SourceResponse<TOutput>
    }

    const promise = this.executeRequest<TInput, TOutput>(request, providers, policy, cacheKey)
      .finally(() => {
        this.inFlightRequests.delete(dedupeKey)
      })

    this.inFlightRequests.set(dedupeKey, promise as Promise<SourceResponse<unknown>>)
    return await promise
  }

  private resolvePolicy<TInput>(request: SourceRequest<TInput>): RequestPolicy {
    const basePolicy = this.policyEngine.getPolicy(request.capability)
    return request.degradeMode ? { ...basePolicy, degradeMode: request.degradeMode } : basePolicy
  }

  private buildProviderChain<TInput>(
    request: SourceRequest<TInput>,
    routePlan: { primary: ProviderKey; fallbacks: ProviderKey[] }
  ): ProviderKey[] {
    if (request.providerHint) {
      return [request.providerHint, ...(request.fallbackProviders ?? routePlan.fallbacks)]
    }
    return [routePlan.primary, ...(request.fallbackProviders ?? routePlan.fallbacks)]
  }

  private buildDedupeKey<TInput>(request: SourceRequest<TInput>, providers: ProviderKey[]) {
    return `${request.capability}:${providers.join('|')}:${stableStringify(request.input)}`
  }

  private async executeRequest<TInput, TOutput>(
    request: SourceRequest<TInput>,
    providers: ProviderKey[],
    policy: RequestPolicy,
    cacheKey: string
  ): Promise<SourceResponse<TOutput>> {
    let lastError: SourceError | undefined

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index]

      if (policy.useCircuitBreaker) {
        try {
          await this.circuitBreaker.beforeRequest(provider)
        } catch {
          if (index < providers.length - 1) {
            continue
          }
        }
      }

      const endpoint = this.registry.getEndpoint(provider, request.capability, request.routeContext?.assetType)

      try {
        if (policy.useRateLimit) {
          await this.rateLimiter.acquire(provider)
        }
        await this.limiter.acquire(provider)
        try {
          const raw = await this.transport.send(endpoint as never, request.input)
          const data = endpoint.mapResponse(raw, request.input) as TOutput

          const response: SourceResponse<TOutput> = {
            data,
            provider,
            endpointId: endpoint.id,
            isFallback: index > 0,
            isStale: false,
            fetchedAt: new Date().toISOString()
          }

          this.cache.set(cacheKey, response)
          this.healthRegistry.recordSuccess(provider, endpoint.id)
          if (policy.useCircuitBreaker) {
            this.circuitBreaker.recordSuccess(provider)
          }

          return response
        } finally {
          this.limiter.release(provider)
        }
      } catch (error) {
        lastError = toSourceError(error, endpoint.provider, endpoint.id)
        this.healthRegistry.recordFailure(provider, endpoint.id, lastError.code)
        if (policy.useCircuitBreaker) {
          this.circuitBreaker.recordFailure(provider)
        }

        if (policy.degradeMode === 'strict') {
          throw lastError
        }

        if (policy.degradeMode === 'stale-while-error') {
          const staleCache = this.cache.getStale<TOutput>(cacheKey, policy.staleTtlMs)
          if (staleCache) {
            return staleCache
          }
        }
      }
    }

    if (policy.degradeMode === 'fallback' && policy.staleTtlMs) {
      const staleCache = this.cache.getStale<TOutput>(cacheKey, policy.staleTtlMs)
      if (staleCache) {
        return staleCache
      }
    }

    throw lastError ?? new SourceError(
      `No fallback available for ${request.capability}`,
      'NO_FALLBACK_AVAILABLE',
      request.providerHint ?? 'eastmoney',
      'unknown',
      false
    )
  }
}

let defaultSourceGateway: SourceGateway | undefined

export function getDefaultSourceGateway() {
  if (!defaultSourceGateway) {
    defaultSourceGateway = new SourceGateway()
  }
  return defaultSourceGateway
}
