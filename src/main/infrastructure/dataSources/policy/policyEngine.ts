import type { Capability, RequestPolicy } from '@main/infrastructure/dataSources/types/sourceTypes'

const POLICY_MAP: Record<Capability, RequestPolicy> = {
  'asset.search': {
    retryCount: 0,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 30_000
  },
  'asset.profile': {
    retryCount: 0,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 5 * 60_000
  },
  'asset.quote': {
    retryCount: 1,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 30_000,
    staleTtlMs: 2 * 60_000
  },
  'asset.dividend': {
    retryCount: 0,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 5 * 60_000
  },
  'asset.kline': {
    retryCount: 1,
    degradeMode: 'stale-while-error',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 10 * 60_000,
    staleTtlMs: 60 * 60_000
  },
  'valuation.snapshot': {
    retryCount: 1,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 30_000,
    staleTtlMs: 2 * 60_000
  },
  'valuation.percentile': {
    retryCount: 0,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 60_000
  },
  'valuation.trend': {
    retryCount: 0,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 5 * 60_000
  },
  'benchmark.kline': {
    retryCount: 1,
    degradeMode: 'fallback',
    useInFlightDedupe: true,
    useCircuitBreaker: false,
    useRateLimit: false,
    cacheTtlMs: 10 * 60_000,
    staleTtlMs: 60 * 60_000
  }
}

export class PolicyEngine {
  getPolicy(capability: Capability): RequestPolicy {
    return POLICY_MAP[capability]
  }
}
