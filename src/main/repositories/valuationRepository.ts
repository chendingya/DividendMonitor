import type { StockValuationSource } from '@main/adapters/contracts'
import { createValuationDataSource } from '@main/adapters'
import type {
  ValuationDataSource,
  ValuationIndicatorType,
  ValuationSnapshotSource
} from '@main/adapters/contracts'
import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'
import { TimedCache } from '@main/infrastructure/cache/timedCache'
import { ValuationCacheRepository } from '@main/repositories/valuationCacheRepository'

const VALUATION_CACHE_TTL_MS = 15 * 60 * 1000

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

export class ValuationRepository {
  private readonly memoryCache = new TimedCache<string, StockValuationSource>(VALUATION_CACHE_TTL_MS)

  constructor(
    private readonly dataSource: ValuationDataSource = createValuationDataSource(),
    private readonly diskCache: ValuationCacheRepository = new ValuationCacheRepository()
  ) {}

  async getStockValuation(symbol: string): Promise<StockValuationSource | undefined> {
    const memoryHit = this.memoryCache.getFresh(symbol)
    if (memoryHit) {
      return memoryHit.value
    }

    const diskHit = this.diskCache.findFreshByKey<StockValuationSource>(symbol, VALUATION_CACHE_TTL_MS)
    if (diskHit) {
      this.memoryCache.set(symbol, diskHit)
      return diskHit
    }

    // SourceGateway handles provider-level concurrency, so Promise.all here is safe.
    const [pe, pb] = await Promise.all([this.resolveMetric(symbol, 1), this.resolveMetric(symbol, 2)])
    const valuation =
      pe || pb
        ? {
            pe,
            pb
          }
        : undefined

    // Only cache successful results. Caching undefined would block retries
    // for the full TTL duration after a transient failure.
    if (valuation) {
      this.memoryCache.set(symbol, valuation)
      try {
        this.diskCache.upsert(symbol, JSON.stringify(valuation))
      } catch {
        // 磁盘缓存写失败不阻断主流程
      }
    }

    return valuation
  }

  private async resolveMetric(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationMetric | undefined> {
    const [snapshotResult, trendResult] = await Promise.allSettled([
      this.dataSource.getSnapshot(symbol, indicatorType),
      this.dataSource.getTrend(symbol, indicatorType)
    ])

    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : undefined
    const history = trendResult.status === 'fulfilled' ? trendResult.value : []

    return buildMetric(snapshot, history)
  }
}
