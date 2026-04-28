import type { AShareDataSource, CoreStockDetailSource } from '@main/adapters/contracts'
import { getJson } from '@main/infrastructure/http/httpClient'
import { extractYear, toIsoDate, toNumber } from '@main/adapters/eastmoney/eastmoneyUtils'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'

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
    f173?: number
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
const TENCENT_KLINE_LIMIT = 2000

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

function parseTencentMarketSnapshot(symbol: string, payload: TencentKlineResponse): TencentMarketSnapshot {
  const key = toTencentSymbol(symbol)
  const data = payload.data?.[key]
  const quoteFields = data?.qt?.[key]
  // Backtest and event replay use raw day-line first to avoid double-counting when dividends are reinvested explicitly.
  const priceHistory = parseTencentPriceHistory(data?.day ?? data?.qfqday)

  if (!quoteFields || quoteFields.length < 58) {
    throw new Error(`Tencent market data is incomplete for ${symbol}`)
  }

  const latestPrice = toNumber(quoteFields[3])
  if (latestPrice == null) {
    throw new Error(`Tencent latest price is missing for ${symbol}`)
  }

  const marketCapInYi = toNumber(quoteFields[44])
  const peRatio = toNumber(quoteFields[39])
  // qt[73] is total shares, while qt[72]/qt[76] are float-share variants for many A-shares.
  const totalSharesRaw = toNumber(quoteFields[73]) ?? toNumber(quoteFields[72]) ?? toNumber(quoteFields[76])

  return {
    name: quoteFields[1] || symbol,
    symbol: quoteFields[2] || symbol,
    latestPrice,
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

  private async getTencentMarketSnapshot(symbol: string): Promise<TencentMarketSnapshot> {
    const qqSymbol = toTencentSymbol(symbol)
    const url =
      `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qqSymbol},day,,,${TENCENT_KLINE_LIMIT},qfq`

    const payload = await getJson<TencentKlineResponse>(url, {
      headers: {
        Referer: 'https://gu.qq.com/',
        'User-Agent': 'Mozilla/5.0 DividendMonitor/0.1.0'
      }
    })

    return parseTencentMarketSnapshot(symbol, payload)
  }

  private async getDividendRecords(symbol: string): Promise<EastmoneyDividendRecord[]> {
    const url =
      'https://datacenter-web.eastmoney.com/api/data/v1/get' +
      `?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${symbol}")`)}` +
      '&pageNumber=1&pageSize=200&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1&source=WEB&client=WEB'
    const payload = await getJson<EastmoneyDividendResponse>(url)
    return payload.result?.data ?? []
  }

  private async getPush2Roe(symbol: string): Promise<number | undefined> {
    const secid = toPush2Secid(symbol)
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f173`
    const payload = await getJson<EastmoneyPush2Response>(url)
    const roe = payload.data?.f173
    return roe != null && roe !== 0 ? roe : undefined
  }

  async getDetail(symbol: string): Promise<CoreStockDetailSource> {
    if (!isAShareSymbol(symbol)) {
      throw new Error(`Only A-share 6-digit symbols are supported: ${symbol}`)
    }

    const [marketResult, dividendResult, roeResult] = await Promise.allSettled([
      this.getTencentMarketSnapshot(symbol),
      this.getDividendRecords(symbol),
      this.getPush2Roe(symbol)
    ])

    if (marketResult.status !== 'fulfilled') {
      throw marketResult.reason instanceof Error
        ? marketResult.reason
        : new Error(`Failed to load market data for ${symbol}`)
    }

    const market = marketResult.value
    const priceHistory = market.priceHistory
    const dividendRecords = dividendResult.status === 'fulfilled' ? dividendResult.value : []

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
    const roe = roeResult.status === 'fulfilled' ? roeResult.value : undefined

    return {
      stock: {
        symbol: market.symbol,
        name: dividendRecords[0]?.SECURITY_NAME_ABBR ?? market.name,
        market: 'A_SHARE',
        latestPrice: market.latestPrice,
        marketCap: market.marketCap,
        peRatio: market.peRatio,
        roe,
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
    return Promise.all(symbols.map((symbol) => this.getDetail(symbol)))
  }
}
