import type { AssetDetailDto, AssetQueryDto } from '@shared/contracts/api'
import { toAssetDetailDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'
import { AssetSnapshotRepository } from '@main/repositories/assetSnapshotRepository'
import { IndexValuationRepository } from '@main/repositories/indexValuationRepository'
import type { FundAssetDetailSource } from '@main/repositories/assetProviderRegistry'

function isFundSource(source: { kind: string }): source is FundAssetDetailSource {
  return source.kind === 'ETF' || source.kind === 'FUND'
}

export async function getAssetDetail(query: AssetQueryDto): Promise<AssetDetailDto> {
  const repository = new AssetRepository()
  const snapshotRepository = new AssetSnapshotRepository()
  const source = await repository.getDetail(query)

  let indexValuation: Awaited<ReturnType<IndexValuationRepository['getIndexValuation']>> | undefined
  if (isFundSource(source) && source.trackingIndex) {
    const indexRepo = new IndexValuationRepository()
    indexValuation = await indexRepo.getIndexValuation(source.trackingIndex)
  }

  const detail = toAssetDetailDto(source, indexValuation)
  const snapshot = snapshotRepository.findByKey(detail.assetKey)

  return {
    ...detail,
    // 数据更新时间语义：磁盘快照命中 → 快照抓取时刻；未命中（实时拉取）→ 本次拉取时刻。
    // 数据源不提供更精确的源站时间戳，故不引入三级 fallback。
    fetchedAt: snapshot?.fetchedAt ?? new Date().toISOString()
  }
}
