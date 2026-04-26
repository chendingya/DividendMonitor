import type { AssetDetailDto, AssetQueryDto } from '@shared/contracts/api'
import { toAssetDetailDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function getAssetDetail(query: AssetQueryDto): Promise<AssetDetailDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(query)
  return toAssetDetailDto(source)
}
