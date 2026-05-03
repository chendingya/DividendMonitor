import type { AssetCompareRequestDto, AssetComparisonRowDto } from '@shared/contracts/api'
import { toAssetComparisonRowDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'
import { IndexValuationRepository, type IndexValuationSource } from '@main/repositories/indexValuationRepository'
import type { FundAssetDetailSource } from '@main/repositories/assetProviderRegistry'

export async function compareAssets(request: AssetCompareRequestDto): Promise<AssetComparisonRowDto[]> {
  const repository = new AssetRepository()
  const sources = await repository.compare(request)

  const indexRepo = new IndexValuationRepository()
  const indexValuations = new Map<string, IndexValuationSource | undefined>()

  const fundSources = sources.filter((s): s is FundAssetDetailSource => s.kind !== 'STOCK' && s.trackingIndex != null)
  await Promise.all(
    fundSources.map(async (s) => {
      const val = await indexRepo.getIndexValuation(s.trackingIndex!)
      indexValuations.set(s.trackingIndex!, val)
    })
  )

  return sources.map((source) => {
    const trackingIndex = source.kind !== 'STOCK' ? (source as FundAssetDetailSource).trackingIndex : undefined
    const indexVal = trackingIndex ? indexValuations.get(trackingIndex) : undefined
    return toAssetComparisonRowDto(source, indexVal)
  })
}
