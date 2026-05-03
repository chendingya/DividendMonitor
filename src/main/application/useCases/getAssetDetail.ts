import type { AssetDetailDto, AssetQueryDto } from '@shared/contracts/api'
import { toAssetDetailDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'
import { IndexValuationRepository } from '@main/repositories/indexValuationRepository'

export async function getAssetDetail(query: AssetQueryDto): Promise<AssetDetailDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(query)

  let indexValuation: Awaited<ReturnType<IndexValuationRepository['getIndexValuation']>> | undefined
  if (source.kind !== 'STOCK' && source.trackingIndex) {
    const indexRepo = new IndexValuationRepository()
    indexValuation = await indexRepo.getIndexValuation(source.trackingIndex)
  }

  return toAssetDetailDto(source, indexValuation)
}
