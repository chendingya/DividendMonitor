import { eastmoneyEndpoints } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'
import { sinaEndpoints } from '@main/infrastructure/dataSources/registry/sinaEndpoints'
import { tencentEndpoints } from '@main/infrastructure/dataSources/registry/tencentEndpoints'
import type {
  Capability,
  EndpointDefinition,
  ProviderKey
} from '@main/infrastructure/dataSources/types/sourceTypes'

type AssetTypeHint = 'STOCK' | 'ETF' | 'FUND'

export class EndpointRegistry {
  private readonly endpoints = new Map<string, EndpointDefinition<any, any, any>>()

  constructor(definitions: Array<EndpointDefinition<any, any, any>> = [...eastmoneyEndpoints, ...tencentEndpoints, ...sinaEndpoints]) {
    for (const definition of definitions) {
      // Register with generic key
      this.endpoints.set(this.toKey(definition.provider, definition.capability), definition)

      // Register with assetType-specific key if id contains asset type hint
      const assetType = this.extractAssetTypeFromId(definition.id)
      if (assetType) {
        this.endpoints.set(this.toKey(definition.provider, definition.capability, assetType), definition)
      }
    }
  }

  getEndpoint(provider: ProviderKey, capability: Capability, assetType?: string): EndpointDefinition<any, any, any> {
    // Try exact match with assetType first
    if (assetType) {
      const specific = this.endpoints.get(this.toKey(provider, capability, assetType))
      if (specific) return specific
    }

    // Fallback to generic key
    const endpoint = this.endpoints.get(this.toKey(provider, capability))
    if (!endpoint) {
      throw new Error(`No endpoint registered for ${provider}:${capability}`)
    }
    return endpoint
  }

  private toKey(provider: ProviderKey, capability: Capability, assetType?: string) {
    return assetType ? `${provider}:${capability}:${assetType}` : `${provider}:${capability}`
  }

  private extractAssetTypeFromId(id: string): AssetTypeHint | undefined {
    // Use regex to match .stock, .fund, .etf at end or followed by another segment
    if (/\.stock(?:\.|$)/.test(id)) return 'STOCK'
    if (/\.fund(?:\.|$)/.test(id)) return 'FUND'
    if (/\.etf(?:\.|$)/.test(id)) return 'FUND'
    return undefined
  }
}
