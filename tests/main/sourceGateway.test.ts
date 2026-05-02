import { describe, expect, it, vi } from 'vitest'
import { SourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'
import type {
  EndpointDefinition,
  RequestPolicy,
  RoutePlan,
  SourceRequest
} from '@main/infrastructure/dataSources/types/sourceTypes'

describe('SourceGateway', () => {
  it('falls back to the next provider when primary fails', async () => {
    const registry = {
      getEndpoint(provider: 'eastmoney' | 'tencent') {
        const endpoint: EndpointDefinition<{ keyword: string }, { value: string }, string> = {
          id: `${provider}.asset.search`,
          provider,
          capability: 'asset.search',
          parser: 'json',
          method: 'GET',
          timeoutMs: 1000,
          buildUrl: () => 'https://example.test',
          mapResponse: (raw) => raw.value
        }
        return endpoint
      }
    }

    const router = {
      resolve(): RoutePlan {
        return {
          primary: 'eastmoney',
          fallbacks: ['tencent'],
          degradeMode: 'fallback'
        }
      }
    }

    const policyEngine = {
      getPolicy(): RequestPolicy {
        return {
          retryCount: 0,
          degradeMode: 'fallback',
          useInFlightDedupe: true,
          useCircuitBreaker: false,
          useRateLimit: false
        }
      }
    }

    const transport = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error('NETWORK failure'))
        .mockResolvedValueOnce({ value: 'ok-from-fallback' })
    }

    const gateway = new SourceGateway(registry as never, router as never, policyEngine as never, transport as never)

    const result = await gateway.request<{ keyword: string }, string>({
      capability: 'asset.search',
      input: { keyword: '银行' }
    })

    expect(result.data).toBe('ok-from-fallback')
    expect(result.provider).toBe('tencent')
    expect(result.isFallback).toBe(true)
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('dedupes identical in-flight requests', async () => {
    const registry = {
      getEndpoint() {
        const endpoint: EndpointDefinition<{ keyword: string }, { value: string }, string> = {
          id: 'eastmoney.asset.search',
          provider: 'eastmoney',
          capability: 'asset.search',
          parser: 'json',
          method: 'GET',
          timeoutMs: 1000,
          buildUrl: () => 'https://example.test',
          mapResponse: (raw) => raw.value
        }
        return endpoint
      }
    }

    const router = {
      resolve(): RoutePlan {
        return {
          primary: 'eastmoney',
          fallbacks: [],
          degradeMode: 'fallback'
        }
      }
    }

    const policyEngine = {
      getPolicy(): RequestPolicy {
        return {
          retryCount: 0,
          degradeMode: 'fallback',
          useInFlightDedupe: true,
          useCircuitBreaker: false,
          useRateLimit: false
        }
      }
    }

    const transport = {
      send: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { value: 'shared-result' }
      })
    }

    const gateway = new SourceGateway(registry as never, router as never, policyEngine as never, transport as never)
    const request: SourceRequest<{ keyword: string }> = {
      capability: 'asset.search',
      input: { keyword: '红利' }
    }

    const [left, right] = await Promise.all([gateway.request(request), gateway.request(request)])

    expect(left.data).toBe('shared-result')
    expect(right.data).toBe('shared-result')
    expect(transport.send).toHaveBeenCalledTimes(1)
  })
})
