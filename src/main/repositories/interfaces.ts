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
import type { DividendEvent } from '@main/domain/entities/Stock'
import type { DividendEventWithAsset } from '@main/repositories/dividendRepository'

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
  /**
   * 应用除权除息后回写持仓：更新股数、摊薄后的成本价，以及已应用的除权日游标。
   */
  applyCorporateActionAdjustment(
    id: string,
    shares: number,
    avgCost: number,
    appliedUntil: string
  ): Promise<void>
}

export interface IDividendRepository {
  upsertMany(assetKey: string, events: DividendEvent[]): void
  listByAsset(assetKey: string): DividendEvent[]
  listPendingCorporateActions(assetKey: string, sinceExDate?: string): DividendEvent[]
  listAssetKeysWithEvents(): string[]
  listUpcomingByAssetKeys(assetKeys: string[], sinceYear?: number): DividendEventWithAsset[]
}
