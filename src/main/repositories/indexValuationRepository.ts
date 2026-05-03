import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'
import type { ValuationDataSource, ValuationSnapshotSource } from '@main/adapters/contracts'
import type { IndexValuationSnapshotAdapter } from '@main/adapters/danjuan/danjuanIndexValuationAdapter'
import { DanjuanIndexValuationAdapter } from '@main/adapters/danjuan/danjuanIndexValuationAdapter'
import { resolveIndexCode } from '@main/repositories/indexCodeResolver'
import { createValuationDataSource } from '@main/adapters'

export type IndexValuationSource = {
  indexCode: string
  indexName: string
  source: 'eastmoney' | 'danjuan'
  pe?: ValuationMetric
  pb?: ValuationMetric
  hasHistory: boolean
}

type CacheEntry = {
  expiresAt: number
  value: IndexValuationSource | undefined
}

const INDEX_VALUATION_CACHE_TTL_MS = 15 * 60 * 1000
const indexValuationCache = new Map<string, CacheEntry>()

function buildMetric(snapshot: ValuationSnapshotSource | undefined, history: ValuationTrendPoint[]): ValuationMetric | undefined {
  const currentValue = snapshot?.currentValue ?? history[0]?.value

  if (currentValue == null && history.length === 0) {
    return undefined
  }

  return {
    currentValue: currentValue != null && currentValue > 0 ? currentValue : undefined,
    currentPercentile:
      snapshot?.currentPercentile != null && snapshot.currentPercentile >= 0 ? snapshot.currentPercentile : undefined,
    status: snapshot?.status,
    history
  }
}

export class IndexValuationRepository {
  constructor(
    private readonly eastmoneyDataSource: ValuationDataSource = createValuationDataSource(),
    private readonly danjuanAdapter: IndexValuationSnapshotAdapter = new DanjuanIndexValuationAdapter()
  ) {}

  async getIndexValuation(indexName: string): Promise<IndexValuationSource | undefined> {
    const indexResult = await resolveIndexCode(indexName)
    if (!indexResult) {
      return undefined
    }

    const { code: indexCode, name: resolvedName, market } = indexResult

    const cached = indexValuationCache.get(indexCode)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }

    const eastmoneyResult = await this.tryEastmoney(indexCode, resolvedName)
    if (eastmoneyResult) {
      this.cacheResult(indexCode, eastmoneyResult)
      return eastmoneyResult
    }

    const danjuanResult = await this.tryDanjuan(indexCode, resolvedName, market)
    if (danjuanResult) {
      this.cacheResult(indexCode, danjuanResult)
      return danjuanResult
    }

    return undefined
  }

  private async tryEastmoney(indexCode: string, indexName: string): Promise<IndexValuationSource | undefined> {
    const [pe, pb] = await Promise.all([
      this.resolveEastmoneyMetric(indexCode, 1),
      this.resolveEastmoneyMetric(indexCode, 2)
    ])

    if (!pe && !pb) return undefined

    return {
      indexCode,
      indexName,
      source: 'eastmoney',
      pe,
      pb,
      hasHistory: true
    }
  }

  private async tryDanjuan(indexCode: string, indexName: string, market: 'SH' | 'SZ'): Promise<IndexValuationSource | undefined> {
    const snapshot = await this.danjuanAdapter.getIndexSnapshot(indexCode, market)
    if (!snapshot) return undefined

    return {
      indexCode,
      indexName,
      source: 'danjuan',
      pe: {
        currentValue: snapshot.currentValue,
        currentPercentile: snapshot.currentPercentile,
        status: snapshot.status === 'low' ? '估值较低' : snapshot.status === 'high' ? '估值较高' : '估值中等',
        history: []
      },
      hasHistory: false
    }
  }

  private async resolveEastmoneyMetric(indexCode: string, indicatorType: 1 | 2): Promise<ValuationMetric | undefined> {
    const [snapshotResult, trendResult] = await Promise.allSettled([
      this.eastmoneyDataSource.getSnapshot(indexCode, indicatorType),
      this.eastmoneyDataSource.getTrend(indexCode, indicatorType)
    ])

    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : undefined
    const history = trendResult.status === 'fulfilled' ? trendResult.value : []

    // 东方财富 RPT_VALUATIONSTATUS 接口对指数返回 PE/PB*100（如 519.45 实际应为 ~5.19），
    // 而对股票返回正确值。指数 PE/PB 不可能超过 100，据此修正。
    if (snapshot?.currentValue != null && snapshot.currentValue > 100) {
      snapshot.currentValue = snapshot.currentValue / 100
    }

    return buildMetric(snapshot, history)
  }

  private cacheResult(indexCode: string, value: IndexValuationSource | undefined): void {
    indexValuationCache.set(indexCode, {
      expiresAt: Date.now() + INDEX_VALUATION_CACHE_TTL_MS,
      value
    })
  }
}
