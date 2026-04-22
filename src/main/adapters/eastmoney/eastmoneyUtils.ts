const SH_PREFIXES = ['600', '601', '603', '605', '688', '689']
const SZ_PREFIXES = ['000', '001', '002', '003', '300', '301']
const BJ_PREFIXES = ['430', '831', '832', '833', '834', '835', '836', '837', '838', '839', '870', '871', '872', '873', '920']

export function buildSecid(symbol: string): string {
  if (SH_PREFIXES.some((prefix) => symbol.startsWith(prefix))) {
    return `1.${symbol}`
  }

  if (SZ_PREFIXES.some((prefix) => symbol.startsWith(prefix))) {
    return `0.${symbol}`
  }

  if (BJ_PREFIXES.some((prefix) => symbol.startsWith(prefix))) {
    return `0.${symbol}`
  }

  throw new Error(`Unable to infer secid for symbol ${symbol}`)
}

export function toNumber(value: unknown): number | undefined {
  if (value == null || value === '' || value === '-') {
    return undefined
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

export function toIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length < 10) {
    return undefined
  }

  return value.slice(0, 10)
}

export function extractYear(value: unknown): number | undefined {
  const date = toIsoDate(value)
  if (!date) {
    return undefined
  }

  const year = Number(date.slice(0, 4))
  return Number.isFinite(year) ? year : undefined
}
