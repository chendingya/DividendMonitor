import type { AssetCompareRequestDto, AssetComparisonRowDto } from '@shared/contracts/api'
import { toAssetComparisonRowDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function compareAssets(request: AssetCompareRequestDto): Promise<AssetComparisonRowDto[]> {
  const repository = new AssetRepository()
  const sources = await repository.compare(request)
  return sources.map((source) => toAssetComparisonRowDto(source))
}
