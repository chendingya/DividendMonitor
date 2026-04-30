import { getDatabase } from '@main/infrastructure/db/sqlite'
import type {
  AssetIdentifierDto,
  AssetQueryDto,
  PortfolioPositionDto,
  PortfolioPositionReplaceByAssetDto,
  PortfolioPositionUpsertDto
} from '@shared/contracts/api'
import { buildAssetKey, normalizeAssetCode, resolveAssetQuery } from '@shared/contracts/api'
import type { IPortfolioRepository } from '@main/repositories/interfaces'

type PortfolioPositionRow = {
  id: string
  asset_key: string
  asset_type: AssetIdentifierDto['assetType']
  market: AssetIdentifierDto['market']
  code: string
  name: string
  direction: 'BUY' | 'SELL'
  shares: number
  avg_cost: number
  created_at: string
  updated_at: string
}

function normalizeIdentity(request: AssetQueryDto): AssetIdentifierDto {
  const identity = resolveAssetQuery(request)
  return {
    assetType: identity.assetType,
    market: identity.market,
    code: normalizeAssetCode(identity.code)
  }
}

function toDto(row: PortfolioPositionRow): PortfolioPositionDto {
  return {
    id: row.id,
    assetKey: row.asset_key,
    assetType: row.asset_type,
    market: row.market,
    code: row.code,
    symbol: row.asset_type === 'STOCK' ? row.code : undefined,
    name: row.name,
    direction: row.direction,
    shares: Number(row.shares),
    avgCost: Number(row.avg_cost),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class PortfolioRepository implements IPortfolioRepository {
  async list(): Promise<PortfolioPositionDto[]> {
    const db = getDatabase()
    const rows = db
      .prepare(
        `
          SELECT id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, created_at, updated_at
          FROM portfolio_positions
          ORDER BY updated_at DESC, created_at DESC, id DESC
        `
      )
      .all() as PortfolioPositionRow[]

    return rows.map(toDto)
  }

  async upsert(request: PortfolioPositionUpsertDto): Promise<void> {
    const code = normalizeAssetCode(request.code ?? request.symbol ?? '')
    const assetType = request.assetType ?? (request.symbol ? 'STOCK' : undefined)
    const market = request.market ?? (request.symbol ? 'A_SHARE' : undefined)
    if (!assetType || !market || !code) {
      throw new Error('持仓缺少资产标识信息。')
    }

    const name = request.name.trim()
    if (!name) {
      throw new Error('持仓名称不能为空。')
    }

    const shares = Number(request.shares)
    const avgCost = Number(request.avgCost)
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
      throw new Error('持仓股数和成本价必须为正数。')
    }

    const now = new Date().toISOString()
    const id = request.id?.trim() || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const assetKey = request.assetKey?.trim() || buildAssetKey(assetType, market, code)
    const direction = request.direction === 'SELL' ? 'SELL' : 'BUY'
    const db = getDatabase()
    const existing = db.prepare('SELECT created_at FROM portfolio_positions WHERE id = ?').get(id) as
      | { created_at?: string }
      | undefined

    db.prepare(
      `
        INSERT INTO portfolio_positions (
          id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          asset_key = excluded.asset_key,
          asset_type = excluded.asset_type,
          market = excluded.market,
          code = excluded.code,
          name = excluded.name,
          direction = excluded.direction,
          shares = excluded.shares,
          avg_cost = excluded.avg_cost,
          updated_at = excluded.updated_at
      `
    ).run(id, assetKey, assetType, market, code, name, direction, shares, avgCost, existing?.created_at ?? now, now)
  }

  async remove(id: string): Promise<void> {
    const normalized = id.trim()
    if (!normalized) {
      return
    }

    const db = getDatabase()
    db.prepare('DELETE FROM portfolio_positions WHERE id = ?').run(normalized)
  }

  async removeByAsset(request: AssetQueryDto): Promise<void> {
    const identity = normalizeIdentity(request)
    const assetKey = buildAssetKey(identity.assetType, identity.market, identity.code)
    const db = getDatabase()
    db.prepare('DELETE FROM portfolio_positions WHERE asset_key = ?').run(assetKey)
  }

  async replaceByAsset(request: PortfolioPositionReplaceByAssetDto): Promise<void> {
    const identity = normalizeIdentity(request.asset)
    const name = request.name.trim()
    const shares = Number(request.shares)
    const avgCost = Number(request.avgCost)
    if (!name) {
      throw new Error('持仓名称不能为空。')
    }
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
      throw new Error('持仓股数和成本价必须为正数。')
    }

    const assetKey = buildAssetKey(identity.assetType, identity.market, identity.code)
    const now = new Date().toISOString()
    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const db = getDatabase()

    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM portfolio_positions WHERE asset_key = ?').run(assetKey)
      db.prepare(
        `
          INSERT INTO portfolio_positions (
            id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(id, assetKey, identity.assetType, identity.market, identity.code, name, 'BUY', shares, avgCost, now, now)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
