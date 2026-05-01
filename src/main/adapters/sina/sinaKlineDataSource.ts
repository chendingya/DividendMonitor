import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import { getJson } from '@main/infrastructure/http/httpClient'

type SinaKlineItem = {
  day: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

function toSinaSymbol(code: string): string {
  const normalized = code.trim()
  // Shanghai: 5xxxxx (ETF), 6xxxxx (stocks)
  if (normalized.startsWith('5') || normalized.startsWith('6')) {
    return `sh${normalized}`
  }
  // Shenzhen: 0xxxxx, 1xxxxx (ETF), 3xxxxx
  return `sz${normalized}`
}

/**
 * Fetch daily K-line from Sina Finance API.
 * Returns unadjusted (不复权) closing prices, most recent N bars.
 *
 * @param code Stock/ETF code
 * @param datalen Number of bars to fetch (default 5000 = all history)
 */
export async function fetchSinaDailyKline(
  code: string,
  datalen = 5000
): Promise<HistoricalPricePoint[]> {
  try {
    const sinaSymbol = toSinaSymbol(code)
    const url =
      `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData` +
      `?symbol=${sinaSymbol}&scale=240&ma=no&datalen=${datalen}`

    const data = await getJson<SinaKlineItem[]>(url)

    if (!Array.isArray(data) || data.length === 0) return []

    return data
      .map((item) => {
        const date = item.day?.trim()
        const close = parseFloat(item.close)
        if (!date || !Number.isFinite(close)) return null
        return { date, close }
      })
      .filter((p): p is HistoricalPricePoint => p != null)
  } catch {
    return []
  }
}
