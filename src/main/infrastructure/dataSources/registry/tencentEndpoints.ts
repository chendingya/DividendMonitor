import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import type {
  BenchmarkKlineInput,
  EndpointDefinition
} from '@main/infrastructure/dataSources/types/sourceTypes'

export type TencentMarketSnapshot = {
  name: string
  symbol: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
  pbRatio?: number
  totalShares?: number
}

export type TencentEtfKlineData = {
  klines: HistoricalPricePoint[]
  name?: string
  latestPrice?: number
}

type TencentKlinePayload = {
  data?: Record<string, {
    day?: Array<[string, string, string, string, string, string]>
    qfqday?: Array<[string, string, string, string, string, string]>
    qt?: string[]
  }>
}

type TencentQuoteInput = {
  code: string
}

type TencentQuotePayload = string

type TencentAssetKlineInput = {
  code: string
}

function parseBenchmarkCode(symbol: string): string {
  const code = symbol.replace(/^1\./, '')
  if (code.startsWith('000')) return `sh${code}`
  if (code.startsWith('399')) return `sz${code}`
  return `sh${code}`
}

function toTencentStockSymbol(code: string) {
  return code.startsWith('6') ? `sh${code}` : `sz${code}`
}

function toTencentEtfSymbol(code: string) {
  if (code.startsWith('5')) return `sh${code}`
  if (code.startsWith('1')) return `sz${code}`
  return `sh${code}`
}

function parseTencentQuote(raw: string, symbol: string): TencentMarketSnapshot | null {
  const match = raw.match(/"([^"]+)"/)
  if (!match) return null
  const fields = match[1].split('~')
  const latestPrice = Number(fields[3])
  if (!Number.isFinite(latestPrice) || latestPrice <= 0) return null

  const marketCapRaw = Number(fields[44])
  const peRatio = Number(fields[39])
  const pbRatio = Number(fields[46])
  const totalShares73 = Number(fields[73])
  const totalShares72 = Number(fields[72])
  const totalShares76 = Number(fields[76])

  return {
    name: fields[1] || symbol,
    symbol: fields[2] || symbol,
    latestPrice,
    marketCap: Number.isFinite(marketCapRaw) && marketCapRaw > 0 ? marketCapRaw * 100000000 : undefined,
    peRatio: Number.isFinite(peRatio) ? peRatio : undefined,
    pbRatio: Number.isFinite(pbRatio) ? pbRatio : undefined,
    totalShares: [totalShares73, totalShares72, totalShares76].find((value) => Number.isFinite(value) && value > 0)
  }
}

export const tencentAssetQuoteEndpoint: EndpointDefinition<
  TencentQuoteInput,
  TencentQuotePayload,
  TencentMarketSnapshot | null
> = {
  id: 'tencent.quote.snapshot',
  provider: 'tencent',
  capability: 'asset.quote',
  parser: 'gbk',
  method: 'GET',
  timeoutMs: 8000,
  headers: {
    Referer: 'https://gu.qq.com/'
  },
  buildUrl: ({ code }) => `https://qt.gtimg.cn/q=${toTencentStockSymbol(code)}`,
  mapResponse: (raw, input) => parseTencentQuote(raw, input.code)
}

export const tencentBenchmarkKlineEndpoint: EndpointDefinition<
  BenchmarkKlineInput,
  TencentKlinePayload,
  HistoricalPricePoint[]
> = {
  id: 'tencent.kline.index',
  provider: 'tencent',
  capability: 'benchmark.kline',
  parser: 'json',
  method: 'GET',
  timeoutMs: 8000,
  headers: {
    Referer: 'https://gu.qq.com/'
  },
  buildUrl: ({ benchmarkSymbol }) => {
    const qqSymbol = parseBenchmarkCode(benchmarkSymbol)
    return `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qqSymbol},day,,,2000,qfq`
  },
  mapResponse: (raw, input) => {
    const qqSymbol = parseBenchmarkCode(input.benchmarkSymbol)
    const symbolData = raw.data?.[qqSymbol]
    const lines = symbolData?.day ?? symbolData?.qfqday ?? []
    return lines
      .map((row) => ({
        date: row[0],
        close: parseFloat(row[2])
      }))
      .filter((item) => item.date && Number.isFinite(item.close))
  }
}

export const tencentAssetKlineEndpoint: EndpointDefinition<
  TencentAssetKlineInput,
  TencentKlinePayload,
  TencentEtfKlineData
> = {
  id: 'tencent.kline.asset',
  provider: 'tencent',
  capability: 'asset.kline',
  parser: 'json',
  method: 'GET',
  timeoutMs: 8000,
  headers: {
    Referer: 'https://gu.qq.com/'
  },
  buildUrl: ({ code }) => {
    const qqSymbol = toTencentEtfSymbol(code)
    return `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qqSymbol},day,,,2000,qfq`
  },
  mapResponse: (raw, input) => {
    const qqSymbol = toTencentEtfSymbol(input.code)
    const data = raw.data?.[qqSymbol]
    const rows = data?.day ?? data?.qfqday ?? []
    const klines = rows
      .map((row) => {
        const date = row[0]?.trim()
        const close = Number(row[2])
        if (!date || !Number.isFinite(close)) return null
        return { date, close }
      })
      .filter((point): point is HistoricalPricePoint => point != null)

    const qtArray = data?.qt
    const latestPrice = qtArray?.[3] ? Number(qtArray[3]) : klines[klines.length - 1]?.close

    return {
      klines,
      name: qtArray?.[1]?.trim() || undefined,
      latestPrice: Number.isFinite(latestPrice ?? NaN) ? latestPrice : undefined
    }
  }
}

export const tencentEndpoints = [tencentAssetQuoteEndpoint, tencentBenchmarkKlineEndpoint, tencentAssetKlineEndpoint]
