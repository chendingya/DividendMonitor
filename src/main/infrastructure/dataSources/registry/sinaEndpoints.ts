import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import type { EndpointDefinition, FxQuoteInput, FxQuoteOutput } from '@main/infrastructure/dataSources/types/sourceTypes'

type SinaKlineItem = {
  day: string
  close: string
}

export type SinaKlineInput = {
  code: string
  datalen?: number
}

function toSinaSymbol(code: string): string {
  const normalized = code.trim()
  if (normalized.startsWith('5') || normalized.startsWith('6')) {
    return `sh${normalized}`
  }
  return `sz${normalized}`
}

type SinaPreciousMetalQuoteInput = {
  code: string
}

type SinaPreciousMetalQuotePayload = {
  f43?: number
  f57?: string
  f58?: string
}

function toSgeSinaCode(code: string): string {
  const normalized = code.trim().toUpperCase()
  if (normalized.startsWith('HF_')) return normalized
  return `SGE_${normalized}`
}

function parseSinaSgeQuote(raw: string, code: string): SinaPreciousMetalQuotePayload {
  const match = raw.match(/var hq_str_\w+="([^"]+)"/)
  if (!match) return {}
  const fields = match[1].split(',')
  const isInternational = code.toUpperCase().startsWith('HF_')
  const latestPrice = parseFloat(fields[isInternational ? 0 : 3] ?? '')
  const name = fields[1] ?? ''
  return {
    f43: Number.isFinite(latestPrice) ? latestPrice : undefined,
    f57: code,
    f58: name ? name.trim() : undefined
  }
}

export const sinaPreciousMetalQuoteEndpoint: EndpointDefinition<
  SinaPreciousMetalQuoteInput,
  string,
  SinaPreciousMetalQuotePayload
> = {
  id: 'sina.precious.quote',
  provider: 'sina',
  capability: 'asset.quote',
  parser: 'gbk',
  method: 'GET',
  timeoutMs: 8000,
  headers: {
    Referer: 'https://finance.sina.com.cn'
  },
  buildUrl: ({ code }) => `https://hq.sinajs.cn/list=${toSgeSinaCode(code)}`,
  mapResponse: (raw, input) => parseSinaSgeQuote(raw, input.code)
}

function parseSinaFxQuote(raw: string, pair: string): FxQuoteOutput {
  const match = raw.match(/var hq_str_\w+="([^"]*)"/)
  if (!match) return { pair, rate: 0, fetchedAt: new Date().toISOString() }
  const fields = match[1].split(',')
  const rate = parseFloat(fields[1] ?? '')
  return {
    pair,
    rate: Number.isFinite(rate) ? rate : 0,
    fetchedAt: new Date().toISOString()
  }
}

export const sinaFxQuoteEndpoint: EndpointDefinition<
  FxQuoteInput,
  string,
  FxQuoteOutput
> = {
  id: 'sina.fx.quote',
  provider: 'sina',
  capability: 'fx.quote',
  parser: 'gbk',
  method: 'GET',
  timeoutMs: 8000,
  headers: {
    Referer: 'https://finance.sina.com.cn'
  },
  buildUrl: ({ pair }) => `https://hq.sinajs.cn/list=${pair}`,
  mapResponse: (raw, input) => parseSinaFxQuote(raw, input.pair)
}

export const sinaAssetKlineEndpoint: EndpointDefinition<SinaKlineInput, SinaKlineItem[], HistoricalPricePoint[]> = {
  id: 'sina.kline.daily',
  provider: 'sina',
  capability: 'asset.kline',
  parser: 'json',
  method: 'GET',
  timeoutMs: 10000,
  buildUrl: ({ code, datalen = 5000 }) => {
    const sinaSymbol = toSinaSymbol(code)
    return 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData' +
      `?symbol=${sinaSymbol}&scale=240&ma=no&datalen=${datalen}`
  },
  mapResponse: (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) {
      return []
    }
    return raw
      .map((item) => {
        const date = item.day?.trim()
        const close = parseFloat(item.close)
        if (!date || !Number.isFinite(close)) return null
        return { date, close }
      })
      .filter((point): point is HistoricalPricePoint => point != null)
  }
}

export const sinaEndpoints = [sinaAssetKlineEndpoint, sinaPreciousMetalQuoteEndpoint, sinaFxQuoteEndpoint]
