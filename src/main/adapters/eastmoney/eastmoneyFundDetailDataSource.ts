import type { AssetType } from '@shared/contracts/api'
import type { FundDetailDataSource, FundDetailSource } from '@main/adapters/contracts'
import type { DividendEvent, HistoricalPricePoint } from '@main/domain/entities/Stock'
import { getJson, getText } from '@main/infrastructure/http/httpClient'

type FundQuoteResponse = {
  data?: {
    f43?: number
    f57?: string
    f58?: string
  }
}

type FundKlineResponse = {
  data?: {
    klines?: string[]
  }
}

type ParsedFundBasicProfile = {
  name?: string
  category?: string
  manager?: string
  trackingIndex?: string
  benchmark?: string
  latestNav?: number
  fundScale?: number
}

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
  if (!value) {
    return undefined
  }

  const normalized = value.replace(/,/g, '').trim()
  const matched = normalized.match(/([0-9]+(?:\.[0-9]+)?)(亿|万)?/)
  if (!matched) {
    return undefined
  }

  const base = Number(matched[1])
  if (!Number.isFinite(base)) {
    return undefined
  }

  if (matched[2] === '亿') {
    return base * 100_000_000
  }

  if (matched[2] === '万') {
    return base * 10_000
  }

  return base
}

function extractFieldText(html: string, label: string) {
  const blockMatch = html.match(
    new RegExp(`<[^>]*>\\s*${escapeRegExp(label)}\\s*<\\/[^>]*>\\s*<[^>]*>([\\s\\S]{0,200}?)<\\/[^>]*>`, 'i')
  )
  if (blockMatch) {
    return normalizeOptionalText(stripTags(blockMatch[1]))
  }

  const inlineMatch = html.match(new RegExp(`${escapeRegExp(label)}[：:]?([\\s\\S]{0,200}?)<`, 'i'))
  if (inlineMatch) {
    return normalizeOptionalText(stripTags(inlineMatch[1]))
  }

  return undefined
}

function extractFundNameFromTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const cleaned = normalizeOptionalText(stripTags(title ?? ''))
  if (!cleaned) {
    return undefined
  }

  const normalized = cleaned
    .replace(/\s+/g, ' ')
    .replace(/基金基本概况.*$/i, '')
    .replace(/基金档案.*$/i, '')
    .replace(/_.*$/i, '')
    .replace(/\(.*$/, '')
    .trim()

  return normalized || undefined
}

export function parseFundBasicProfile(html: string): ParsedFundBasicProfile {
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

function toReferenceClosePrice(date: string | undefined, priceHistory: HistoricalPricePoint[]) {
  if (!date) {
    return 0
  }

  const matched = priceHistory.find((item) => item.date === date)
  if (matched) {
    return matched.close
  }

  const previous = [...priceHistory].reverse().find((item) => item.date < date)
  return previous?.close ?? 0
}

export function parseFundDividendEvents(html: string, priceHistory: HistoricalPricePoint[]): DividendEvent[] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? []
  const events: DividendEvent[] = []

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => stripTags(match[1]))
    if (cells.length < 5) {
      continue
    }

    const yearMatch = cells[0].match(/^(\d{4})年$/)
    const distributionMatch = cells[3].match(/每份派现金([0-9.]+)元/)
    if (!yearMatch || !distributionMatch) {
      continue
    }

    const year = Number(yearMatch[1])
    const recordDate = normalizeDate(cells[1])
    const exDate = normalizeDate(cells[2])
    const payDate = normalizeDate(cells[4])
    const dividendPerShare = Number(distributionMatch[1])
    if (!Number.isFinite(dividendPerShare)) {
      continue
    }

    events.push({
      year,
      recordDate,
      exDate,
      payDate,
      dividendPerShare,
      referenceClosePrice: toReferenceClosePrice(recordDate ?? exDate, priceHistory),
      source: 'eastmoney-fund'
    })
  }

  return events.sort((left, right) => {
    const leftDate = left.exDate ?? left.payDate ?? left.recordDate ?? `${left.year}-01-01`
    const rightDate = right.exDate ?? right.payDate ?? right.recordDate ?? `${right.year}-01-01`
    return leftDate.localeCompare(rightDate)
  })
}

function resolveFundSecId(code: string) {
  const normalized = code.trim()
  if (/^[56]\d{5}$/.test(normalized)) {
    return `1.${normalized}`
  }

  if (/^[013]\d{5}$/.test(normalized)) {
    return `0.${normalized}`
  }

  if (/^[12]\d{5}$/.test(normalized)) {
    return `0.${normalized}`
  }

  throw new Error(`Unsupported A-share fund code: ${code}`)
}

function normalizeQuotePrice(value: number | undefined) {
  if (value == null || value <= 0) {
    return undefined
  }

  const price = value >= 1000 ? value / 1000 : value
  return Number.isFinite(price) && price > 0 ? price : undefined
}

function parseKlines(payload: FundKlineResponse): HistoricalPricePoint[] {
  return (payload.data?.klines ?? [])
    .map((item) => item.split(','))
    .flatMap((parts) => {
      const date = parts[0]?.trim()
      const close = Number(parts[2])
      if (!date || !Number.isFinite(close)) {
        return []
      }
      return [{ date, close }]
    })
}

export function resolveFundDisplayName(input: {
  basicProfileName?: string
  quoteName?: string
  code: string
}) {
  return normalizeOptionalText(input.basicProfileName) ?? normalizeOptionalText(input.quoteName) ?? input.code.trim()
}

export class EastmoneyFundDetailDataSource implements FundDetailDataSource {
  async getDetail(code: string, assetType: Extract<AssetType, 'ETF' | 'FUND'>): Promise<FundDetailSource> {
    const normalizedCode = code.trim()
    const secId = resolveFundSecId(normalizedCode)
    const [basicHtml, dividendHtml, quotePayload, klinePayload] = await Promise.all([
      getText(`https://fund.eastmoney.com/f10/jbgk_${normalizedCode}.html`),
      getText(`https://fund.eastmoney.com/f10/fhsp_${normalizedCode}.html`),
      getJson<FundQuoteResponse>(
        `https://push2.eastmoney.com/api/qt/stock/get?invt=2&fltt=2&fields=f43,f57,f58&secid=${secId}`
      ),
      getJson<FundKlineResponse>(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secId}&klt=101&fqt=1&lmt=800&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56`
      )
    ])

    const basicProfile = parseFundBasicProfile(basicHtml)
    const priceHistory = parseKlines(klinePayload)
    const dividendEvents = parseFundDividendEvents(dividendHtml, priceHistory)
    const latestPrice =
      normalizeQuotePrice(quotePayload.data?.f43) ??
      priceHistory[priceHistory.length - 1]?.close ??
      basicProfile.latestNav

    if (!latestPrice) {
      throw new Error(`Fund latest price / NAV is unavailable: ${normalizedCode}`)
    }

    return {
      assetType,
      code: normalizedCode,
      name: resolveFundDisplayName({
        basicProfileName: basicProfile.name,
        quoteName: quotePayload.data?.f58,
        code: normalizedCode
      }),
      market: 'A_SHARE',
      category: basicProfile.category,
      manager: basicProfile.manager,
      trackingIndex: basicProfile.trackingIndex,
      benchmark: basicProfile.benchmark,
      latestPrice,
      latestNav: basicProfile.latestNav,
      fundScale: basicProfile.fundScale,
      priceHistory,
      dividendEvents,
      dataSource: 'eastmoney'
    }
  }
}
