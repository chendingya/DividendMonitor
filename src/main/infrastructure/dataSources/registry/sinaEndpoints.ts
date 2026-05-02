import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import type { EndpointDefinition } from '@main/infrastructure/dataSources/types/sourceTypes'

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

export const sinaEndpoints = [sinaAssetKlineEndpoint]
