import type { AssetQueryDto, FutureYieldResponseDto } from '@shared/contracts/api'
import { toFutureYieldResponseDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function estimateFutureYieldForAsset(query: AssetQueryDto): Promise<FutureYieldResponseDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(query)
  return toFutureYieldResponseDto(source)
}
