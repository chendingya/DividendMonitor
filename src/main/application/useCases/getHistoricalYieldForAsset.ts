import type { AssetQueryDto, HistoricalYieldResponseDto } from '@shared/contracts/api'
import { toHistoricalYieldResponseDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function getHistoricalYieldForAsset(query: AssetQueryDto): Promise<HistoricalYieldResponseDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(query)
  return toHistoricalYieldResponseDto(source)
}
