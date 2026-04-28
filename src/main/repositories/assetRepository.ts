import type { AssetCompareRequestDto, AssetQueryDto, AssetSearchRequestDto } from '@shared/contracts/api'
import { buildAssetKey, resolveAssetQuery } from '@shared/contracts/api'
import type { AssetDetailSource, AssetSearchSource } from '@main/repositories/assetProviderRegistry'
import { AssetProviderRegistry } from '@main/repositories/assetProviderRegistry'
import { AssetSnapshotRepository } from '@main/repositories/assetSnapshotRepository'

export class AssetRepository {
  constructor(
    private readonly registry: AssetProviderRegistry = new AssetProviderRegistry(),
    private readonly snapshotRepo: AssetSnapshotRepository = new AssetSnapshotRepository()
  ) {}

  async search(request: AssetSearchRequestDto): Promise<AssetSearchSource[]> {
    const providers = this.registry.getSearchProviders(request.assetTypes)
    const groups = await Promise.all(providers.map((provider) => provider.search(request.keyword)))
    return groups.flat()
  }

  async getDetail(query: AssetQueryDto): Promise<AssetDetailSource> {
    const identifier = resolveAssetQuery(query)
    const assetKey = buildAssetKey(identifier.assetType, identifier.market, identifier.code)

    const cached = this.snapshotRepo.findFreshByKey<AssetDetailSource>(assetKey, identifier.assetType)
    if (cached) {
      return cached
    }

    const provider = this.registry.getProvider(identifier)
    const source = await provider.getDetail(identifier)

    try {
      this.snapshotRepo.upsert(assetKey, identifier.assetType, JSON.stringify(source))
    } catch (err) {
      console.warn(`[AssetRepository] Failed to cache ${assetKey}:`, err)
    }

    return source
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
