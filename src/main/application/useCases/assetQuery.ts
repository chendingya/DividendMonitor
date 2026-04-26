import type { AssetIdentifierDto, AssetQueryDto } from '@shared/contracts/api'
import { resolveAssetQuery } from '@shared/contracts/api'

export function resolveSupportedStockAssetQuery(query: AssetQueryDto): AssetIdentifierDto {
  const identifier = resolveAssetQuery(query)

  if (identifier.assetType !== 'STOCK' || identifier.market !== 'A_SHARE') {
    throw new Error(
      `Asset type is not supported yet in Phase 0: ${identifier.assetType}:${identifier.market}:${identifier.code}`
    )
  }

  return identifier
}
