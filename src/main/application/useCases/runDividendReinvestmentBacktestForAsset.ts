import type { AssetBacktestRequestDto, BacktestResultDto } from '@shared/contracts/api'
import { buildAssetKey, resolveAssetQuery } from '@shared/contracts/api'
import { runDividendReinvestmentBacktest as runBacktest } from '@main/domain/services/dividendReinvestmentBacktestService'
import { AssetRepository } from '@main/repositories/assetRepository'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'

function findPriceOnOrAfter(history: HistoricalPricePoint[], targetDate: string): HistoricalPricePoint | undefined {
  return history.find((p) => p.date >= targetDate)
}

function findPriceOnOrBefore(history: HistoricalPricePoint[], targetDate: string): HistoricalPricePoint | undefined {
  let result: HistoricalPricePoint | undefined
  for (const p of history) {
    if (p.date <= targetDate) result = p
    else break
  }
  return result
}

async function fetchBenchmarkPriceHistory(benchmarkSymbol: string): Promise<HistoricalPricePoint[] | undefined> {
  try {
    const response = await getDefaultSourceGateway().request<{ benchmarkSymbol: string }, HistoricalPricePoint[]>({
      capability: 'benchmark.kline',
      input: { benchmarkSymbol }
    })
    return response.data
  } catch {
    return undefined
  }
}

export async function runDividendReinvestmentBacktestForAsset(
  request: AssetBacktestRequestDto
): Promise<BacktestResultDto> {
  const identifier = resolveAssetQuery(request.asset)
  const repository = new AssetRepository()
  const source = await repository.getDetail(request.asset)

  let benchmarkPriceHistory: HistoricalPricePoint[] | undefined
  if (request.benchmarkSymbol) {
    benchmarkPriceHistory = await fetchBenchmarkPriceHistory(request.benchmarkSymbol)
  }

  const result = runBacktest({
    symbol: identifier.code,
    buyDate: request.buyDate,
    priceHistory: source.priceHistory,
    dividendEvents: source.dividendEvents,
    initialCapital: request.initialCapital,
    includeFees: request.includeFees,
    feeRate: request.feeRate,
    stampDutyRate: request.stampDutyRate,
    minCommission: request.minCommission,
    dcaConfig: request.dcaConfig,
    benchmarkPriceHistory,
    benchmarkSymbol: request.benchmarkSymbol
  })

  // Build benchmark timeline: benchmark return at each transaction date
  let benchmarkTimeline: Array<{ date: string; cumulativeReturn: number }> | undefined
  if (benchmarkPriceHistory && benchmarkPriceHistory.length > 0) {
    const sortedBench = [...benchmarkPriceHistory].sort((a, b) => a.date.localeCompare(b.date))
    const benchStart = findPriceOnOrAfter(sortedBench, result.buyDate)
    if (benchStart && benchStart.close > 0) {
      // Collect all dates from the strategy timeline
      const seen = new Set<string>()
      seen.add(result.buyDate)
      const dates = [result.buyDate]
      for (const tx of result.transactions) {
        if (!seen.has(tx.date)) {
          seen.add(tx.date)
          dates.push(tx.date)
        }
      }
      if (!seen.has(result.finalDate)) {
        dates.push(result.finalDate)
      }

      benchmarkTimeline = []
      for (const date of dates) {
        const benchPoint = findPriceOnOrBefore(sortedBench, date) ?? findPriceOnOrAfter(sortedBench, date)
        if (benchPoint) {
          benchmarkTimeline.push({
            date,
            cumulativeReturn: benchPoint.close / benchStart.close - 1
          })
        }
      }
    }
  }

  return {
    assetKey: buildAssetKey(identifier.assetType, identifier.market, identifier.code),
    assetType: identifier.assetType,
    market: identifier.market,
    code: identifier.code,
    symbol: source.kind === 'STOCK' ? source.stock.symbol : identifier.code,
    benchmarkTimeline,
    ...result
  }
}
