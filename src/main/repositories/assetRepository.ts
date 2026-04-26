import type { AssetCompareRequestDto, AssetQueryDto, AssetSearchRequestDto } from '@shared/contracts/api'
import { resolveAssetQuery } from '@shared/contracts/api'
import type { AssetDetailSource, AssetSearchSource } from '@main/repositories/assetProviderRegistry'
import { AssetProviderRegistry } from '@main/repositories/assetProviderRegistry'

export class AssetRepository {
  constructor(private readonly registry: AssetProviderRegistry = new AssetProviderRegistry()) {}

  async search(request: AssetSearchRequestDto): Promise<AssetSearchSource[]> {
    const providers = this.registry.getSearchProviders(request.assetTypes)
    const groups = await Promise.all(providers.map((provider) => provider.search(request.keyword)))
    return groups.flat()
  }

  async getDetail(query: AssetQueryDto): Promise<AssetDetailSource> {
    const identifier = resolveAssetQuery(query)
    const provider = this.registry.getProvider(identifier)
    return provider.getDetail(identifier)
  }

  async compare(request: AssetCompareRequestDto): Promise<AssetDetailSource[]> {
    const identifiers = request.items.map((item) => resolveAssetQuery(item))
    if (identifiers.length === 0) {
      return []
    }

    const grouped = new Map<string, typeof identifiers>()
    for (const identifier of identifiers) {
      const provider = this.registry.getProvider(identifier)
      const key = provider.assetType
      const items = grouped.get(key) ?? []
      items.push(identifier)
      grouped.set(key, items)
    }

    const resolved = new Map<string, AssetDetailSource>()
    for (const identifiersForProvider of grouped.values()) {
      const provider = this.registry.getProvider(identifiersForProvider[0])
      const details = provider.compare
        ? await provider.compare(identifiersForProvider)
        : await Promise.all(identifiersForProvider.map((identifier) => provider.getDetail(identifier)))

      for (const detail of details) {
        resolved.set(`${detail.identifier.assetType}:${detail.identifier.market}:${detail.identifier.code}`, detail)
      }
    }

    return identifiers.map((identifier) => {
      const key = `${identifier.assetType}:${identifier.market}:${identifier.code}`
      const detail = resolved.get(key)
      if (!detail) {
        throw new Error(`Missing compare detail for ${key}`)
      }
      return detail
    })
  }
}
