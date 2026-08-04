export type YieldMapQuote = {
  code: string
  market: string
  name: string
  price?: number
  industry?: string
}

export type YieldMapDividendEvent = {
  code: string
  exDate?: string
  pretaxBonusRmb?: number
}

export type YieldMapStockEntry = {
  assetKey: string
  symbol: string
  name: string
  industry: string
  price?: number
  yieldTtm: number
  totalDps12m?: number
}

const YIELD_MAP_LOOKBACK_DAYS = 365

function isWithinLookback(exDate: string | undefined, today: Date): boolean {
  if (!exDate || !/^\d{4}-\d{2}-\d{2}$/.test(exDate)) return false
  const [year, month, day] = exDate.split('-').map(Number)
  if (!year || !month || !day) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime())) return false
  const lowerBound = today.getTime() - YIELD_MAP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  return date.getTime() >= lowerBound && date.getTime() <= today.getTime()
}

export function buildYieldMap(
  quotes: YieldMapQuote[],
  events: YieldMapDividendEvent[],
  today: Date = new Date()
): YieldMapStockEntry[] {
  const dpsByCode = new Map<string, number>()
  for (const event of events) {
    if (!isWithinLookback(event.exDate, today)) continue
    const dps = (event.pretaxBonusRmb ?? 0) / 10
    if (dps <= 0) continue
    dpsByCode.set(event.code, (dpsByCode.get(event.code) ?? 0) + dps)
  }

  return quotes.map((quote) => {
    const price = quote.price != null && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : undefined
    const totalDps12m = dpsByCode.get(quote.code)
    const yieldTtm = price && totalDps12m ? totalDps12m / price : 0
    const symbol = quote.code
    const entry: YieldMapStockEntry = {
      assetKey: `STOCK:A_SHARE:${symbol}`,
      symbol,
      name: quote.name,
      industry: quote.industry?.trim() || '未分类',
      price,
      yieldTtm,
      totalDps12m
    }
    return entry
  })
}
