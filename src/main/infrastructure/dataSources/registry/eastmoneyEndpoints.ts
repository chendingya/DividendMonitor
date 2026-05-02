import type {
  EndpointDefinition,
  SearchSuggestInput,
  AssetDividendInput,
  AssetDividendOutput,
  AssetProfileInput,
  AssetProfileOutput,
  ValuationSnapshotInput,
  ValuationSnapshotOutput,
  ValuationPercentileInput,
  ValuationPercentileOutput,
  ValuationTrendInput,
  ValuationTrendOutput,
  StockDividendRecord
} from '@main/infrastructure/dataSources/types/sourceTypes'
import type { HistoricalPricePoint, DividendEvent } from '@main/domain/entities/Stock'

export type EastmoneySuggestItem = {
  Code?: string
  Name?: string
  SecurityTypeName?: string
  SecurityType?: string
  Classify?: string
  MktNum?: string
}

type EastmoneySuggestResponse = {
  Quotations?: EastmoneySuggestItem[]
  QuotationCodeTable?: {
    Data?: EastmoneySuggestItem[]
  }
}

export type EastmoneyFundQuotePayload = {
  f43?: number
  f57?: string
  f58?: string
}

type EastmoneyFundQuoteResponse = {
  data?: EastmoneyFundQuotePayload
}

type EastmoneyKlineResponse = {
  data?: {
    klines?: string[]
  }
}

export type EastmoneyQuoteInput = {
  code: string
}

export type EastmoneyKlineInput = {
  code: string
  fqt?: 0 | 1
  lmt?: number
}

const SEARCH_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8'

// ====== Response types for new endpoints ======

type EastmoneyStockDividendResponse = {
  result?: {
    data?: StockDividendRecord[]
  }
}

type F10CompanySurveyResponse = {
  jbzl?: {
    sshy?: string
    sszjhhy?: string
  }
}

type Push2SnapshotResponse = {
  data?: {
    f43?: number
    f100?: string
    f173?: number
  }
}

// ====== Valuation percentile response types ======

type ValuationStatusRecord = {
  INDEX_VALUE?: number
  INDEX_PERCENTILE?: number
  VALATION_STATUS?: string
}

type ValuationStatusResponse = {
  result?: {
    data?: ValuationStatusRecord[]
  }
}

// ====== Valuation trend response types ======

type ValuationDailyRecord = {
  TRADE_DATE?: string
  PE_TTM?: number
  PB_MRQ?: number
}

type ValuationDailyResponse = {
  result?: {
    data?: ValuationDailyRecord[]
    pages?: number
  }
}

// ====== HTML parsing utilities ======

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeDate(value: string | undefined) {
  const normalized = value?.trim()
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function parseChineseAmountToNumber(value: string | undefined) {
  if (!value) return undefined
  const normalized = value.replace(/,/g, '').trim()
  const matched = normalized.match(/([0-9]+(?:\.[0-9]+)?)(亿|万)?/)
  if (!matched) return undefined
  const base = Number(matched[1])
  if (!Number.isFinite(base)) return undefined
  if (matched[2] === '亿') return base * 100_000_000
  if (matched[2] === '万') return base * 10_000
  return base
}

function extractFieldText(html: string, label: string) {
  const blockMatch = html.match(
    new RegExp(`<[^>]*>\\s*${escapeRegExp(label)}\\s*<\\/[^>]*>\\s*<[^>]*>([\\s\\S]{0,200}?)<\\/[^>]*>`, 'i')
  )
  if (blockMatch) return normalizeOptionalText(stripTags(blockMatch[1]))

  const labeledTagMatch = html.match(
    new RegExp(
      `${escapeRegExp(label)}(?:[(（][^)）]*[)）])?[：:]?\\s*<[^>]*>([\\s\\S]{0,200}?)<\\/[^>]*>`,
      'i'
    )
  )
  if (labeledTagMatch) return normalizeOptionalText(stripTags(labeledTagMatch[1]))

  const inlineMatch = html.match(
    new RegExp(`${escapeRegExp(label)}(?:[(（][^)）]*[)）])?[：:]?([\\s\\S]{0,200}?)<`, 'i')
  )
  if (inlineMatch) return normalizeOptionalText(stripTags(inlineMatch[1]))

  return undefined
}

function extractFundNameFromTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const cleaned = normalizeOptionalText(stripTags(title ?? ''))
  if (!cleaned) return undefined
  const normalized = cleaned
    .replace(/\s+/g, ' ')
    .replace(/基金基本概况.*$/i, '')
    .replace(/基金档案.*$/i, '')
    .replace(/_.*$/i, '')
    .replace(/\(.*$/, '')
    .trim()
  return normalized || undefined
}

export function parseFundBasicProfile(html: string): AssetProfileOutput {
  return {
    name:
      extractFieldText(html, '基金简称') ??
      extractFieldText(html, '基金全称') ??
      extractFieldText(html, '基金名称') ??
      extractFundNameFromTitle(html),
    category: extractFieldText(html, '基金类型') ?? extractFieldText(html, '类型'),
    manager: extractFieldText(html, '基金管理人') ?? extractFieldText(html, '管理人'),
    trackingIndex: extractFieldText(html, '跟踪标的'),
    benchmark: extractFieldText(html, '业绩比较基准'),
    latestNav: parseChineseAmountToNumber(extractFieldText(html, '单位净值')),
    fundScale: parseChineseAmountToNumber(extractFieldText(html, '净资产规模'))
  }
}

function toReferenceClosePrice(date: string | undefined, priceHistory: HistoricalPricePoint[], fallbackPrice?: number) {
  if (!date) return 0
  const matched = priceHistory.find((item) => item.date === date)
  if (matched) return matched.close
  const previous = [...priceHistory].reverse().find((item) => item.date < date)
  return previous?.close ?? fallbackPrice ?? 0
}

export function parseFundDividendEvents(html: string, priceHistory: HistoricalPricePoint[], fallbackPrice?: number): DividendEvent[] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? []
  const events: DividendEvent[] = []

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => stripTags(match[1]))
    if (cells.length < 5) continue

    const yearMatch = cells[0].match(/^(\d{4})年$/)
    const distributionMatch = cells[3].match(/每份派现金([0-9.]+)元/)
    if (!yearMatch || !distributionMatch) continue

    const year = Number(yearMatch[1])
    const recordDate = normalizeDate(cells[1])
    const exDate = normalizeDate(cells[2])
    const payDate = normalizeDate(cells[4])
    const dividendPerShare = Number(distributionMatch[1])
    if (!Number.isFinite(dividendPerShare)) continue

    events.push({
      year,
      recordDate,
      exDate,
      payDate,
      dividendPerShare,
      referenceClosePrice: toReferenceClosePrice(recordDate ?? exDate, priceHistory, fallbackPrice),
      source: 'eastmoney-fund'
    })
  }

  return events.sort((left, right) => {
    const leftDate = left.exDate ?? left.payDate ?? left.recordDate ?? `${left.year}-01-01`
    const rightDate = right.exDate ?? right.payDate ?? right.recordDate ?? `${right.year}-01-01`
    return leftDate.localeCompare(rightDate)
  })
}

function resolveAShareSecId(code: string) {
  const normalized = code.trim()
  if (normalized.startsWith('6') || normalized.startsWith('5')) {
    return `1.${normalized}`
  }
  return `0.${normalized}`
}

export const eastmoneyAssetSearchEndpoint: EndpointDefinition<
  SearchSuggestInput,
  EastmoneySuggestResponse,
  EastmoneySuggestItem[]
> = {
  id: 'eastmoney.search.suggest',
  provider: 'eastmoney',
  capability: 'asset.search',
  parser: 'json',
  method: 'GET',
  timeoutMs: 8000,
  buildUrl: ({ keyword, count }) =>
    `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}` +
    `&type=14&token=${SEARCH_TOKEN}&count=${count}`,
  mapResponse: (raw) => raw.Quotations ?? raw.QuotationCodeTable?.Data ?? []
}

export const eastmoneyAssetQuoteEndpoint: EndpointDefinition<
  EastmoneyQuoteInput,
  EastmoneyFundQuoteResponse,
  EastmoneyFundQuotePayload
> = {
  id: 'eastmoney.push2.quote',
  provider: 'eastmoney',
  capability: 'asset.quote',
  parser: 'json',
  method: 'GET',
  timeoutMs: 8000,
  buildUrl: ({ code }) =>
    `https://push2.eastmoney.com/api/qt/stock/get?invt=2&fltt=2&fields=f43,f57,f58&secid=${resolveAShareSecId(code)}`,
  mapResponse: (raw) => raw.data ?? {}
}

export const eastmoneyAssetKlineEndpoint: EndpointDefinition<
  EastmoneyKlineInput,
  EastmoneyKlineResponse,
  HistoricalPricePoint[]
> = {
  id: 'eastmoney.push2his.kline',
  provider: 'eastmoney',
  capability: 'asset.kline',
  parser: 'json',
  method: 'GET',
  timeoutMs: 10000,
  buildUrl: ({ code, fqt = 1, lmt = 2000 }) =>
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${resolveAShareSecId(code)}` +
    `&klt=101&fqt=${fqt}&lmt=${lmt}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56`,
  mapResponse: (raw) =>
    (raw.data?.klines ?? [])
      .map((item) => item.split(','))
      .flatMap((parts) => {
        const date = parts[0]?.trim()
        const close = Number(parts[2])
        if (!date || !Number.isFinite(close)) return []
        return [{ date, close }]
      })
}

// ====== Stock dividend endpoint ======

export const eastmoneyStockDividendEndpoint: EndpointDefinition<
  AssetDividendInput,
  EastmoneyStockDividendResponse,
  AssetDividendOutput
> = {
  id: 'eastmoney.dividend.stock',
  provider: 'eastmoney',
  capability: 'asset.dividend',
  parser: 'json',
  method: 'GET',
  timeoutMs: 10000,
  buildUrl: ({ code }) =>
    'https://datacenter-web.eastmoney.com/api/data/v1/get' +
    `?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${code}")`)}` +
    '&pageNumber=1&pageSize=200&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1&source=WEB&client=WEB',
  mapResponse: (raw) => ({
    records: raw.result?.data ?? [],
    events: []
  })
}

// ====== Fund dividend endpoint (HTML) ======

export const eastmoneyFundDividendEndpoint: EndpointDefinition<
  AssetDividendInput,
  string,
  AssetDividendOutput
> = {
  id: 'eastmoney.dividend.fund',
  provider: 'eastmoney',
  capability: 'asset.dividend',
  parser: 'text',
  method: 'GET',
  timeoutMs: 10000,
  buildUrl: ({ code }) => `https://fund.eastmoney.com/f10/fhsp_${code}.html`,
  mapResponse: (html, input) => ({
    records: [],
    events: parseFundDividendEvents(html, input.priceHistory ?? [], input.fallbackPrice)
  })
}

// ====== Stock profile endpoint (F10) ======

export const eastmoneyStockProfileEndpoint: EndpointDefinition<
  AssetProfileInput,
  F10CompanySurveyResponse,
  AssetProfileOutput
> = {
  id: 'eastmoney.profile.stock',
  provider: 'eastmoney',
  capability: 'asset.profile',
  parser: 'json',
  method: 'GET',
  timeoutMs: 8000,
  buildUrl: ({ code }) => {
    const f10Code = code.startsWith('6') ? `SH${code}` : `SZ${code}`
    return `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax?code=${f10Code}`
  },
  mapResponse: (raw) => ({
    industry: raw.jbzl?.sshy?.trim() || undefined
  })
}

// ====== Fund profile endpoint (HTML) ======

export const eastmoneyFundProfileEndpoint: EndpointDefinition<
  AssetProfileInput,
  string,
  AssetProfileOutput
> = {
  id: 'eastmoney.profile.fund',
  provider: 'eastmoney',
  capability: 'asset.profile',
  parser: 'text',
  method: 'GET',
  timeoutMs: 8000,
  buildUrl: ({ code }) => `https://fund.eastmoney.com/f10/jbgk_${code}.html`,
  mapResponse: (html) => parseFundBasicProfile(html)
}

// ====== Valuation snapshot endpoint ======

export const eastmoneyValuationSnapshotEndpoint: EndpointDefinition<
  ValuationSnapshotInput,
  Push2SnapshotResponse,
  ValuationSnapshotOutput
> = {
  id: 'eastmoney.valuation.snapshot',
  provider: 'eastmoney',
  capability: 'valuation.snapshot',
  parser: 'json',
  method: 'GET',
  timeoutMs: 8000,
  buildUrl: ({ code }) => {
    const secid = code.startsWith('6') ? `1.${code}` : `0.${code}`
    return `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f100,f173`
  },
  mapResponse: (raw) => ({
    roe: raw.data?.f173 != null && raw.data?.f173 !== 0 ? raw.data?.f173 : undefined,
    industry: raw.data?.f100?.trim() || undefined
  })
}

// ====== Valuation percentile endpoint ======

const VALUATION_DATA_CENTER_URL = 'https://datacenter.eastmoney.com/securities/api/data/get'

function buildValuationHeaders() {
  return {
    Referer: 'https://emdata.eastmoney.com/',
    Origin: 'https://emdata.eastmoney.com'
  }
}

export const eastmoneyValuationPercentileEndpoint: EndpointDefinition<
  ValuationPercentileInput,
  ValuationStatusResponse,
  ValuationPercentileOutput
> = {
  id: 'eastmoney.valuation.percentile',
  provider: 'eastmoney',
  capability: 'valuation.percentile',
  parser: 'json',
  method: 'GET',
  timeoutMs: 10000,
  headers: buildValuationHeaders(),
  buildUrl: ({ code, indicatorType }) =>
    `${VALUATION_DATA_CENTER_URL}?type=RPT_VALUATIONSTATUS` +
    '&sty=SECUCODE,TRADE_DATE,INDICATOR_TYPE,INDEX_VALUE,INDEX_PERCENTILE,VALATION_STATUS' +
    '&callback=&extraCols=&p=1&ps=1&sr=&st=&token=&var=source=DataCenter&client=WAP' +
    `&filter=${encodeURIComponent(`(SECURITY_CODE="${code}")(INDICATOR_TYPE="${indicatorType}")`)}`,
  mapResponse: (raw) => {
    const record = raw.result?.data?.[0]
    if (!record) return {}
    return {
      currentValue: record.INDEX_VALUE,
      currentPercentile: record.INDEX_PERCENTILE,
      status: record.VALATION_STATUS
    }
  }
}

// ====== Valuation trend endpoint ======

export const eastmoneyValuationTrendEndpoint: EndpointDefinition<
  ValuationTrendInput,
  ValuationDailyResponse,
  ValuationTrendOutput
> = {
  id: 'eastmoney.valuation.trend',
  provider: 'eastmoney',
  capability: 'valuation.trend',
  parser: 'json',
  method: 'GET',
  timeoutMs: 15000,
  headers: buildValuationHeaders(),
  buildUrl: ({ code }) =>
    `${VALUATION_DATA_CENTER_URL}?type=RPT_VALUEANALYSIS_DET` +
    '&sty=PE_TTM,PB_MRQ,TRADE_DATE&sr=-1&st=TRADE_DATE&p=1&ps=2000' +
    '&var=source=DataCenter&client=WAP' +
    `&filter=${encodeURIComponent(`(SECURITY_CODE="${code}")`)}`,
  mapResponse: (raw, input) => {
    const records = raw.result?.data ?? []
    // indicatorType: 1 = PE, 2 = PB
    const selectValue = input.indicatorType === 1
      ? (r: ValuationDailyRecord) => r.PE_TTM
      : (r: ValuationDailyRecord) => r.PB_MRQ

    return records
      .map((record) => {
        const date = record.TRADE_DATE?.trim().slice(0, 10)
        const value = selectValue(record)
        if (!date || value == null || value <= 0) return null
        return { date, value }
      })
      .filter((item): item is { date: string; value: number } => item != null)
      .sort((a, b) => b.date.localeCompare(a.date))
  }
}

export const eastmoneyEndpoints = [
  eastmoneyAssetSearchEndpoint,
  eastmoneyAssetQuoteEndpoint,
  eastmoneyAssetKlineEndpoint,
  eastmoneyStockDividendEndpoint,
  eastmoneyFundDividendEndpoint,
  eastmoneyStockProfileEndpoint,
  eastmoneyFundProfileEndpoint,
  eastmoneyValuationSnapshotEndpoint,
  eastmoneyValuationPercentileEndpoint,
  eastmoneyValuationTrendEndpoint
]
