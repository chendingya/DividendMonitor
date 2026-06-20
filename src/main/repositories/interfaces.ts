import type {
  AssetIdentifierDto,
  AssetKey,
  AssetQueryDto,
  AssetType,
  MarketCode,
  PortfolioPositionDto,
  PortfolioPositionReplaceByAssetDto,
  PortfolioPositionUpsertDto,
  WatchlistGroupDto,
  WatchlistGroupUpsertDto
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

export interface IWatchlistGroupRepository {
  listGroups(): Promise<WatchlistGroupDto[]>
  createGroup(request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto>
  updateGroup(id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto>
  deleteGroup(id: string): Promise<void>
  addToGroup(groupId: string, assetKey: AssetKey): Promise<void>
  removeFromGroup(groupId: string, assetKey: AssetKey): Promise<void>
  listGroupAssets(groupId: string): Promise<WatchlistAssetRecord[]>
  getAssetGroupIds(assetKey: AssetKey): Promise<string[]>
}

export interface IPortfolioRepository {
  list(): Promise<PortfolioPositionDto[]>
  upsert(request: PortfolioPositionUpsertDto): Promise<void>
  remove(id: string): Promise<void>
  removeByAsset(request: AssetQueryDto): Promise<void>
  replaceByAsset(request: PortfolioPositionReplaceByAssetDto): Promise<void>
}
