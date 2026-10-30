import type { AssetSearchItemDto, AssetType, MarketCode } from '@shared/contracts/api'

export function createPortfolioEditorInitialValues() {
  return {
    assetKey: '', assetType: undefined, market: undefined,
    code: '', symbol: '', name: '', direction: 'BUY' as const,
    shares: 100, avgCost: 10
  }
}

export function pickBestSearchResult(keyword: string, results: AssetSearchItemDto[], assetType?: AssetType, market?: MarketCode) {
  const normalized = keyword.trim().toUpperCase()
  if (!normalized) return undefined
  if (!assetType && /^\d+$/.test(normalized) && results.some((item) => item.searchIncomplete)) return undefined
  const candidates = results.filter((item) => (!assetType || item.assetType === assetType) && (!market || item.market === market))
  const exactCode = candidates.filter((item) => item.code.toUpperCase() === normalized || item.symbol?.toUpperCase() === normalized)
  if (exactCode.length) return exactCode.length === 1 ? exactCode[0] : undefined
  const exactName = candidates.filter((item) => item.name.toUpperCase() === normalized)
  if (exactName.length) return exactName.length === 1 ? exactName[0] : undefined
  const prefixName = candidates.filter((item) => item.name.toUpperCase().startsWith(normalized))
  return prefixName.length === 1 ? prefixName[0] : undefined
}
