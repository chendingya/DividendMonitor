import type { AShareDataSource, CoreStockDetailSource } from '@main/adapters/contracts'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'
import type { EastmoneySuggestItem } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'
import type { TencentMarketSnapshot } from '@main/infrastructure/dataSources/registry/tencentEndpoints'
import type {
  AssetDividendInput,
  AssetDividendOutput,
  AssetProfileInput,
  AssetProfileOutput,
  ValuationSnapshotInput,
  ValuationSnapshotOutput,
  StockDividendRecord
} from '@main/infrastructure/dataSources/types/sourceTypes'
import { extractYear, toIsoDate, toNumber } from '@main/adapters/eastmoney/eastmoneyUtils'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import { fetchSinaDailyKline } from '@main/adapters/sina/sinaKlineDataSource'
import { getPriceCacheRepository } from '@main/repositories/repositoryFactory'

function isAShareSymbol(symbol: string) {
  // A-share stock codes: 6xxxxx (Shanghai), 000xxx-004xxx (Shenzhen main/SME), 300xxx-301xxx (ChiNext)
  return /^(6\d{5}|00[0-4]\d{3}|30[0-1]\d{3})$/.test(symbol.trim())
}

function deriveRoe(peRatio?: number, pbRatio?: number): number | undefined {
  if (peRatio == null || pbRatio == null || peRatio <= 0 || pbRatio <= 0) return undefined
  return (pbRatio / peRatio) * 100
}


function findReferenceClosePrice(priceHistory: HistoricalPricePoint[], anchorDate?: string) {
  if (!anchorDate) {
    return undefined
  }

  const normalized = anchorDate.slice(0, 10)

  for (let index = priceHistory.length - 1; index >= 0; index -= 1) {
    const point = priceHistory[index]
    if (point.date < normalized) {
      return point.close
    }
  }

  return priceHistory.find((point) => point.date === normalized)?.close
}

function pickLatestAnnualDividendRecord(records: StockDividendRecord[]) {
  return [...records]
    .filter((record) => toIsoDate(record.REPORT_DATE)?.endsWith('-12-31'))
    .sort((a, b) => (toIsoDate(b.REPORT_DATE) ?? '').localeCompare(toIsoDate(a.REPORT_DATE) ?? ''))[0]
}

function calculateDividendAmount(record: StockDividendRecord) {
  const dividendPerShare = (toNumber(record.PRETAX_BONUS_RMB) ?? 0) / 10
  const totalShares = toNumber(record.TOTAL_SHARES)
  return dividendPerShare > 0 && totalShares != null ? dividendPerShare * totalShares : undefined
}

function buildLatestFiscalYearSummary(records: StockDividendRecord[]) {
  const latestAnnualRecord = pickLatestAnnualDividendRecord(records)
  const fiscalYear = extractYear(latestAnnualRecord?.REPORT_DATE)

  if (!latestAnnualRecord || fiscalYear == null) {
    return {
      latestAnnualRecord: undefined,
      latestAnnualTotalShares: undefined,
      latestAnnualNetProfit: 0,
      lastYearTotalDividendAmount: 0,
      lastAnnualPayoutRatio: 0
    }
  }

  const sameFiscalYearRecords = records.filter((record) => extractYear(record.REPORT_DATE) === fiscalYear)
  const latestAnnualTotalShares = toNumber(latestAnnualRecord.TOTAL_SHARES)
  const latestAnnualBasicEps = toNumber(latestAnnualRecord.BASIC_EPS)
  const latestAnnualNetProfit =
    latestAnnualTotalShares != null && latestAnnualBasicEps != null ? latestAnnualTotalShares * latestAnnualBasicEps : 0
  const lastYearTotalDividendAmount = sameFiscalYearRecords.reduce((sum, record) => {
    return sum + (calculateDividendAmount(record) ?? 0)
  }, 0)
  const lastAnnualPayoutRatio =
    latestAnnualNetProfit > 0 ? lastYearTotalDividendAmount / latestAnnualNetProfit : 0

  return {
    latestAnnualRecord,
    latestAnnualTotalShares,
    latestAnnualNetProfit,
    lastYearTotalDividendAmount,
    lastAnnualPayoutRatio
  }
}

export class EastmoneyAShareDataSource implements AShareDataSource {
  async search(keyword: string) {
    const normalized = keyword.trim()

    if (!normalized) {
      return []
    }

    const quotations = await getDefaultSourceGateway().request<{ keyword: string; count: number }, EastmoneySuggestItem[]>({
      capability: 'asset.search',
      input: {
        keyword: normalized,
        count: 10
      }
    })

    return quotations.data
      .filter((item) => item.Code && item.Name)
      .filter((item) => {
        const classify = (item.Classify ?? '').toLowerCase()
        const securityTypeName = item.SecurityTypeName ?? ''
        const code = item.Code ?? ''
        return (
          classify === 'astock' ||
          securityTypeName.includes('A') ||
          /^(6\d{5}|00[0-4]\d{3}|30[0-1]\d{3})$/.test(code)
        )
      })
      .map((item) => ({
        symbol: item.Code!,
        name: item.Name!,
        market: 'A_SHARE' as const
      }))
  }

  private async getTencentMarketSnapshot(symbol: string): Promise<TencentMarketSnapshot | null> {
    try {
      const payload = await getDefaultSourceGateway().request<{ code: string }, TencentMarketSnapshot | null>({
        capability: 'asset.quote',
        providerHint: 'tencent',
        routeContext: {
          assetType: 'STOCK',
          market: 'A_SHARE',
          code: symbol
        },
        input: {
          code: symbol
        }
      })
      return payload.data
    } catch {
      return null
    }
  }

  private async getDividendRecords(symbol: string): Promise<StockDividendRecord[]> {
    try {
      const response = await getDefaultSourceGateway().request<AssetDividendInput, AssetDividendOutput>({
        capability: 'asset.dividend',
        routeContext: { assetType: 'STOCK', market: 'A_SHARE', code: symbol },
        input: { code: symbol }
      })
      return response.data.records
    } catch {
      return []
    }
  }

  private async getValuationSnapshot(symbol: string): Promise<{ roe?: number; industry?: string }> {
    try {
      const response = await getDefaultSourceGateway().request<ValuationSnapshotInput, ValuationSnapshotOutput>({
        capability: 'valuation.snapshot',
        routeContext: { assetType: 'STOCK', market: 'A_SHARE', code: symbol },
        input: { code: symbol }
      })
      return { roe: response.data.roe, industry: response.data.industry }
    } catch {
      // Fallback to F10 profile endpoint for industry info
      try {
        const profile = await getDefaultSourceGateway().request<AssetProfileInput, AssetProfileOutput>({
          capability: 'asset.profile',
          routeContext: { assetType: 'STOCK', market: 'A_SHARE', code: symbol },
          input: { code: symbol }
        })
        return { industry: profile.data.industry }
      } catch {
        return {}
      }
    }
  }

  private async getEastmoneyKline(symbol: string): Promise<HistoricalPricePoint[]> {
    const response = await getDefaultSourceGateway().request<{ code: string; fqt: 0 | 1; lmt: number }, HistoricalPricePoint[]>({
      capability: 'asset.kline',
      providerHint: 'eastmoney',
      routeContext: {
        assetType: 'STOCK',
        market: 'A_SHARE',
        code: symbol
      },
      input: {
        code: symbol,
        fqt: 1,
        lmt: 2000
      }
    })
    return response.data
  }

  async getDetail(symbol: string): Promise<CoreStockDetailSource> {
    if (!isAShareSymbol(symbol)) {
      throw new Error(`Only A-share 6-digit symbols are supported: ${symbol}`)
    }

    // Check local price cache first — historical data is immutable,
    // only the last few trading days need refreshing.
    const priceCache = getPriceCacheRepository()
    const cachedPrices = priceCache.getPriceHistory(symbol)
    const cachedLatest = priceCache.getLatestDate(symbol)

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    const cacheIsFresh = cachedLatest != null && cachedLatest >= yesterdayStr

    // Calculate how many bars we need to fill the gap since last cached date.
    // If cache is empty, fetch full history (5000 bars ≈ all time).
    const neededBars = cachedLatest
      ? Math.max(10, Math.ceil(
          (Date.now() - new Date(cachedLatest).getTime()) / (1000 * 60 * 60 * 24) * 5 / 7
        ) + 10)
      : 5000

    // SourceGateway's ConcurrencyLimiter caps concurrent requests per provider,
    // so Promise.allSettled is safe here — excess requests naturally queue.
    const [marketResult, dividendResult, snapshotResult, klineResult, sinaResult] = await Promise.allSettled([
      this.getTencentMarketSnapshot(symbol),
      this.getDividendRecords(symbol),
      this.getValuationSnapshot(symbol),
      this.getEastmoneyKline(symbol),
      cacheIsFresh
        ? Promise.resolve(cachedPrices)
        : fetchSinaDailyKline(symbol, neededBars)
    ])

    if (marketResult.status !== 'fulfilled' || !marketResult.value) {
      throw marketResult.status === 'fulfilled'
        ? new Error(`No market data available for ${symbol}`)
        : marketResult.reason instanceof Error
          ? marketResult.reason
          : new Error(`Failed to load market data for ${symbol}`)
    }

    const market = marketResult.value
    const eastmoneyKlines = klineResult.status === 'fulfilled' ? klineResult.value : []

    // Sina result: when cache was fresh we resolved with cached data;
    // when stale we fetched the tail from API. On API failure, fall back to cache.
    const fetchedKlines =
      sinaResult.status === 'fulfilled' ? sinaResult.value : []

    // Only merge into cache when we actually fetched new data (cache miss/stale).
    // When cache is fresh, fetchedKlines === cachedPrices — skip to avoid redundant writes + Supabase pushes.
    let sinaKlines = cachedPrices
    if (!cacheIsFresh && fetchedKlines.length > 0) {
      priceCache.savePriceHistory(symbol, fetchedKlines)
      sinaKlines = priceCache.getPriceHistory(symbol)
    }

    const dividendRecords = dividendResult.status === 'fulfilled' ? dividendResult.value : []

    // Pick the best price history: Sina (full history, 不复权) > Eastmoney
    const priceHistory =
      sinaKlines.length > 0
        ? sinaKlines
        : eastmoneyKlines

    const dividendEvents = dividendRecords
      .filter((record) => (record.ASSIGN_PROGRESS ?? '').includes('实施'))
      .map((record) => {
        const dividendPerShare = (toNumber(record.PRETAX_BONUS_RMB) ?? 0) / 10
        const totalShares = toNumber(record.TOTAL_SHARES)
        const totalDividendAmount = calculateDividendAmount(record)
        const netProfit =
          totalShares != null && (toNumber(record.BASIC_EPS) ?? 0) > 0 ? totalShares * (toNumber(record.BASIC_EPS) ?? 0) : undefined
        const payoutRatio =
          totalDividendAmount != null && netProfit != null && netProfit > 0 ? totalDividendAmount / netProfit : undefined
        const recordDate = toIsoDate(record.EQUITY_RECORD_DATE)
        const exDate = toIsoDate(record.EX_DIVIDEND_DATE)
        const referenceClosePrice =
          findReferenceClosePrice(priceHistory, recordDate ?? exDate) ??
          (dividendPerShare > 0 && (toNumber(record.DIVIDENT_RATIO) ?? 0) > 0
            ? dividendPerShare / (toNumber(record.DIVIDENT_RATIO) ?? 0)
            : 0)

        return {
          year: extractYear(record.EX_DIVIDEND_DATE) ?? extractYear(record.NOTICE_DATE) ?? 0,
          fiscalYear: extractYear(record.REPORT_DATE),
          announceDate: toIsoDate(record.PLAN_NOTICE_DATE),
          recordDate,
          exDate,
          payDate: exDate,
          dividendPerShare,
          totalDividendAmount,
          payoutRatio,
          referenceClosePrice,
          bonusSharePer10: toNumber(record.BONUS_RATIO),
          transferSharePer10: toNumber(record.BONUS_IT_RATIO),
          source: 'eastmoney'
        }
      })
      .filter((event) => event.year > 0 && event.dividendPerShare > 0 && event.referenceClosePrice > 0)
      .sort((a, b) => (a.exDate ?? '').localeCompare(b.exDate ?? ''))

    const fiscalYearSummary = buildLatestFiscalYearSummary(dividendRecords)
    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : {}

    return {
      stock: {
        symbol: market.symbol,
        name: dividendRecords[0]?.SECURITY_NAME_ABBR ?? market.name,
        market: 'A_SHARE',
        industry: snapshot.industry,
        latestPrice: market.latestPrice,
        marketCap: market.marketCap,
        peRatio: market.peRatio,
        pbRatio: market.pbRatio,
        roe: snapshot.roe ?? deriveRoe(market.peRatio, market.pbRatio),
        totalShares: market.totalShares ?? fiscalYearSummary.latestAnnualTotalShares
      },
      dividendEvents,
      priceHistory,
      latestAnnualNetProfit: fiscalYearSummary.latestAnnualNetProfit,
      latestTotalShares: market.totalShares ?? fiscalYearSummary.latestAnnualTotalShares ?? 0,
      lastAnnualPayoutRatio: fiscalYearSummary.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: fiscalYearSummary.lastYearTotalDividendAmount,
      dataSource: 'eastmoney'
    }
  }

  async compare(symbols: string[]): Promise<CoreStockDetailSource[]> {
    const results = await Promise.allSettled(symbols.map((symbol) => this.getDetail(symbol)))
    return results.map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      throw result.reason instanceof Error ? result.reason : new Error(`Failed to load ${symbols[i]}`)
    })
  }
}
