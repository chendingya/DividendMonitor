import type {
  AssetIdentifierDto,
  AssetKey,
  AssetQueryDto,
  AssetType,
  MarketCode,
  PortfolioPositionDto,
  PortfolioPositionReplaceByAssetDto,
  PortfolioPositionUpsertDto
} from '@shared/contracts/api'

export type WatchlistAssetRecord = {
  assetKey: AssetKey
  assetType: AssetType
  market: MarketCode
  code: string
  name?: string
}

export interface IWatchlistRepository {
  listAssets(): Promise<WatchlistAssetRecord[]>
  listSymbols(): Promise<string[]>
  addAsset(asset: AssetIdentifierDto & { name?: string }): Promise<void>
  removeAsset(assetKey: AssetKey): Promise<void>
  addSymbol(symbol: string): Promise<void>
  removeSymbol(symbol: string): Promise<void>
}

export interface IPortfolioRepository {
  list(): Promise<PortfolioPositionDto[]>
  upsert(request: PortfolioPositionUpsertDto): Promise<void>
  remove(id: string): Promise<void>
  removeByAsset(request: AssetQueryDto): Promise<void>
  replaceByAsset(request: PortfolioPositionReplaceByAssetDto): Promise<void>
}
