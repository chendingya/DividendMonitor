import type { AssetBacktestRequestDto, BacktestResultDto } from '@shared/contracts/api'
import { buildAssetKey, resolveAssetQuery } from '@shared/contracts/api'
import { runDividendReinvestmentBacktest as runBacktest } from '@main/domain/services/dividendReinvestmentBacktestService'
import { AssetRepository } from '@main/repositories/assetRepository'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'

function parseBenchmarkCode(symbol: string): string {
  // 东方财富指数代码格式：1.000300，腾讯格式：sh000300
  const code = symbol.replace(/^1\./, '')
  if (code.startsWith('000')) return `sh${code}`
  if (code.startsWith('399')) return `sz${code}`
  return `sh${code}`
}

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
    const qqSymbol = parseBenchmarkCode(benchmarkSymbol)
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qqSymbol},day,,,2000,qfq`
    const response = await fetch(url)
    const json = await response.json() as Record<string, unknown>
    const data = json?.data as Record<string, unknown> | undefined
    const symbolData = data?.[qqSymbol] as Record<string, unknown> | undefined
    const lines = (symbolData?.['day'] ?? symbolData?.['qfqday']) as Array<[string, string, string, string, string, string]> | undefined
    if (!lines || lines.length === 0) return undefined

    return lines.map((row) => ({
      date: row[0],
      close: parseFloat(row[2])
    }))
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
