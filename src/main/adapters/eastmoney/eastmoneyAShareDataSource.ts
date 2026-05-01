import type { AShareDataSource, CoreStockDetailSource } from '@main/adapters/contracts'
import { getJson } from '@main/infrastructure/http/httpClient'
import { extractYear, toIsoDate, toNumber } from '@main/adapters/eastmoney/eastmoneyUtils'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import { fetchSinaDailyKline } from '@main/adapters/sina/sinaKlineDataSource'
import { getPriceCacheRepository } from '@main/repositories/repositoryFactory'

type EastmoneySuggestResponse = {
  Quotations?: EastmoneySuggestItem[]
  QuotationCodeTable?: {
    Data?: EastmoneySuggestItem[]
  }
}

type EastmoneySuggestItem = {
  Code?: string
  Name?: string
  SecurityTypeName?: string
  SecurityType?: string
  Classify?: string
  MktNum?: string
}

type EastmoneyDividendResponse = {
  result?: {
    data?: EastmoneyDividendRecord[]
  }
}

type EastmoneyDividendRecord = {
  SECURITY_CODE?: string
  SECURITY_NAME_ABBR?: string
  REPORT_DATE?: string
  PLAN_NOTICE_DATE?: string
  EQUITY_RECORD_DATE?: string
  EX_DIVIDEND_DATE?: string
  NOTICE_DATE?: string
  PRETAX_BONUS_RMB?: number
  TOTAL_SHARES?: number
  BASIC_EPS?: number
  BONUS_RATIO?: number
  BONUS_IT_RATIO?: number
  DIVIDENT_RATIO?: number
  ASSIGN_PROGRESS?: string
}

type TencentKlineResponse = {
  data?: Record<
    string,
    {
      qfqday?: string[][]
      day?: string[][]
      qt?: Record<string, string[]>
    }
  >
}

type EastmoneyPush2Response = {
  data?: {
    f43?: number
    f100?: string
    f173?: number
  }
}

type EastmoneyKlineResponse = {
  data?: {
    klines?: string[]
  }
}

type TencentMarketSnapshot = {
  name: string
  symbol: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
  totalShares?: number
  priceHistory: HistoricalPricePoint[]
}

const SEARCH_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8'

function parseEastmoneyKlines(payload: EastmoneyKlineResponse): HistoricalPricePoint[] {
  return (payload.data?.klines ?? [])
    .map((item) => item.split(','))
    .flatMap((parts) => {
      const date = parts[0]?.trim()
      const close = toNumber(parts[2])
      if (!date || close == null) return []
      return [{ date: toIsoDate(date) ?? date, close }]
    })
}

function isAShareSymbol(symbol: string) {
  // A-share stock codes: 6xxxxx (Shanghai), 000xxx-004xxx (Shenzhen main/SME), 300xxx-301xxx (ChiNext)
  return /^(6\d{5}|00[0-4]\d{3}|30[0-1]\d{3})$/.test(symbol.trim())
}

function toTencentSymbol(symbol: string) {
  return symbol.startsWith('6') ? `sh${symbol}` : `sz${symbol}`
}

function toPush2Secid(symbol: string) {
  return symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
}

function parseTencentPriceHistory(rows?: string[][]): HistoricalPricePoint[] {
  return (rows ?? [])
    .map((row) => {
      const [date, _open, close] = row
      const closePrice = toNumber(close)
      if (!date || closePrice == null) {
        return null
      }

      return {
        date: toIsoDate(date) ?? date,
        close: closePrice
      }
    })
    .filter((point): point is HistoricalPricePoint => point != null)
}

function parseTencentMarketSnapshot(symbol: string, payload: TencentKlineResponse): TencentMarketSnapshot | null {
  const key = toTencentSymbol(symbol)
  const data = payload.data?.[key]
  const quoteFields = data?.qt?.[key]
  const priceHistory = parseTencentPriceHistory(data?.day ?? data?.qfqday)

  // qt may be incomplete under load; degrade gracefully
  const latestPrice = quoteFields && quoteFields.length >= 4 ? toNumber(quoteFields[3]) : undefined
  if (latestPrice == null && priceHistory.length === 0) {
    return null
  }

  const name = quoteFields?.[1] || symbol
  const displaySymbol = quoteFields?.[2] || symbol
  const marketCapInYi = quoteFields && quoteFields.length > 44 ? toNumber(quoteFields[44]) : undefined
  const peRatio = quoteFields && quoteFields.length > 39 ? toNumber(quoteFields[39]) : undefined
  const totalSharesRaw = quoteFields && quoteFields.length > 73
    ? (toNumber(quoteFields[73]) ?? toNumber(quoteFields[72]) ?? toNumber(quoteFields[76]))
    : undefined

  return {
    name,
    symbol: displaySymbol,
    latestPrice: latestPrice ?? priceHistory[priceHistory.length - 1]?.close ?? 0,
    marketCap: marketCapInYi == null ? undefined : marketCapInYi * 100000000,
    peRatio: peRatio == null || peRatio <= 0 ? undefined : peRatio,
    totalShares: totalSharesRaw == null || totalSharesRaw <= 0 ? undefined : totalSharesRaw,
    priceHistory
  }
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

function pickLatestAnnualDividendRecord(records: EastmoneyDividendRecord[]) {
  return [...records]
    .filter((record) => toIsoDate(record.REPORT_DATE)?.endsWith('-12-31'))
    .sort((a, b) => (toIsoDate(b.REPORT_DATE) ?? '').localeCompare(toIsoDate(a.REPORT_DATE) ?? ''))[0]
}

function calculateDividendAmount(record: EastmoneyDividendRecord) {
  const dividendPerShare = (toNumber(record.PRETAX_BONUS_RMB) ?? 0) / 10
  const totalShares = toNumber(record.TOTAL_SHARES)
  return dividendPerShare > 0 && totalShares != null ? dividendPerShare * totalShares : undefined
}

function buildLatestFiscalYearSummary(records: EastmoneyDividendRecord[]) {
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

    const url =
      `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(normalized)}` +
      `&type=14&token=${SEARCH_TOKEN}&count=10`
    const payload = await getJson<EastmoneySuggestResponse>(url)
    const quotations = payload.Quotations ?? payload.QuotationCodeTable?.Data ?? []

    return quotations
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
      const qqSymbol = toTencentSymbol(symbol)
      const url =
        `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qqSymbol},day,,,2000,qfq`

      const payload = await getJson<TencentKlineResponse>(url, {
        headers: { Referer: 'https://gu.qq.com/' }
      })

      return parseTencentMarketSnapshot(symbol, payload)
    } catch {
      return null
    }
  }

  private async getDividendRecords(symbol: string): Promise<EastmoneyDividendRecord[]> {
    const url =
      'https://datacenter-web.eastmoney.com/api/data/v1/get' +
      `?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${symbol}")`)}` +
      '&pageNumber=1&pageSize=200&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1&source=WEB&client=WEB'
    const payload = await getJson<EastmoneyDividendResponse>(url)
    return payload.result?.data ?? []
  }

  private async getPush2Snapshot(symbol: string): Promise<{ roe?: number; industry?: string }> {
    const secid = toPush2Secid(symbol)
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f100,f173`
    const payload = await getJson<EastmoneyPush2Response>(url)
    const roe = payload.data?.f173 != null && payload.data?.f173 !== 0 ? payload.data?.f173 : undefined
    const industry = payload.data?.f100?.trim() || undefined
    return { roe, industry }
  }

  private async getEastmoneyKline(symbol: string): Promise<HistoricalPricePoint[]> {
    const secid = toPush2Secid(symbol)
    const url =
      `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&lmt=2000&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56`
    const payload = await getJson<EastmoneyKlineResponse>(url)
    return parseEastmoneyKlines(payload)
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

    const [marketResult, dividendResult, snapshotResult, klineResult, sinaResult] = await Promise.allSettled([
      this.getTencentMarketSnapshot(symbol),
      this.getDividendRecords(symbol),
      this.getPush2Snapshot(symbol),
      this.getEastmoneyKline(symbol),
      // Cache miss → full fetch. Cache stale → fetch enough bars to fill gap.
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

    // Merge fetched tail into cache, then read full history from cache
    let sinaKlines = cachedPrices
    if (fetchedKlines.length > 0) {
      priceCache.savePriceHistory(symbol, fetchedKlines)
      sinaKlines = priceCache.getPriceHistory(symbol)
    }

    const dividendRecords = dividendResult.status === 'fulfilled' ? dividendResult.value : []

    // Pick the best price history: Sina (full history, 不复权) > Eastmoney > Tencent
    const priceHistory =
      sinaKlines.length > 0
        ? sinaKlines
        : eastmoneyKlines.length >= market.priceHistory.length
          ? eastmoneyKlines
          : market.priceHistory

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
        roe: snapshot.roe,
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
