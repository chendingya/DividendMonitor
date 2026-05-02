import type { ProviderKey } from '@main/infrastructure/dataSources/types/sourceTypes'
import type { SourceErrorCode } from '@main/infrastructure/dataSources/types/sourceErrors'

export type HealthSnapshot = {
  provider: ProviderKey
  successCount: number
  failureCount: number
  lastSuccessAt?: string
  lastFailureAt?: string
  lastError?: SourceErrorCode
  lastEndpointId?: string
}

type ProviderHealth = {
  successCount: number
  failureCount: number
  lastSuccessAt?: string
  lastFailureAt?: string
  lastError?: SourceErrorCode
  lastEndpointId?: string
}

export class SourceHealthRegistry {
  private readonly health = new Map<ProviderKey, ProviderHealth>()

  recordSuccess(provider: ProviderKey, endpointId: string): void {
    const current = this.health.get(provider) ?? this.createEmptyHealth()
    current.successCount += 1
    current.lastSuccessAt = new Date().toISOString()
    current.lastEndpointId = endpointId
    this.health.set(provider, current)
  }

  recordFailure(provider: ProviderKey, endpointId: string, error: SourceErrorCode): void {
    const current = this.health.get(provider) ?? this.createEmptyHealth()
    current.failureCount += 1
    current.lastFailureAt = new Date().toISOString()
    current.lastError = error
    current.lastEndpointId = endpointId
    this.health.set(provider, current)
  }

  getHealth(provider: ProviderKey): HealthSnapshot {
    const health = this.health.get(provider) ?? this.createEmptyHealth()
    return {
      provider,
      successCount: health.successCount,
      failureCount: health.failureCount,
      lastSuccessAt: health.lastSuccessAt,
      lastFailureAt: health.lastFailureAt,
      lastError: health.lastError,
      lastEndpointId: health.lastEndpointId
    }
  }

  getAllHealth(): HealthSnapshot[] {
    const providers: ProviderKey[] = ['eastmoney', 'tencent', 'sina']
    return providers.map((provider) => this.getHealth(provider))
  }

  reset(provider?: ProviderKey): void {
    if (provider) {
      this.health.delete(provider)
    } else {
      this.health.clear()
    }
  }

  private createEmptyHealth(): ProviderHealth {
    return {
      successCount: 0,
      failureCount: 0
    }
  }
}

let defaultHealthRegistry: SourceHealthRegistry | undefined

export function getDefaultHealthRegistry(): SourceHealthRegistry {
  if (!defaultHealthRegistry) {
    defaultHealthRegistry = new SourceHealthRegistry()
  }
  return defaultHealthRegistry
}
