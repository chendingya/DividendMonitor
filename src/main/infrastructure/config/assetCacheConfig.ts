import type { AssetType } from '@shared/contracts/api'

export const ASSET_CACHE_TTL_MS: Record<AssetType, number> = {
  STOCK: 15 * 60 * 1000,
  ETF: 15 * 60 * 1000,
  FUND: 24 * 60 * 60 * 1000
}

export function getAssetTtlMs(assetType: AssetType): number {
  return ASSET_CACHE_TTL_MS[assetType] ?? 15 * 60 * 1000
}

export function isSnapshotFresh(fetchedAtIso: string, assetType: AssetType): boolean {
  const age = Date.now() - new Date(fetchedAtIso).getTime()
  return age < getAssetTtlMs(assetType)
}

export const FIXED_POOL_ASSET_KEYS: string[] = [
  'STOCK:A_SHARE:600519',
  'STOCK:A_SHARE:000858',
  'STOCK:A_SHARE:601088',
  'STOCK:A_SHARE:600900',
  'STOCK:A_SHARE:601398',
  'STOCK:A_SHARE:601939',
  'STOCK:A_SHARE:601288',
  'STOCK:A_SHARE:600036',
  'STOCK:A_SHARE:601318',
  'STOCK:A_SHARE:000333',
  'STOCK:A_SHARE:600887',
  'STOCK:A_SHARE:600585',
  'ETF:A_SHARE:510050',
  'ETF:A_SHARE:510300',
  'ETF:A_SHARE:510500'
]
