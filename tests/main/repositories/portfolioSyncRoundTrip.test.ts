import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
import type { PortfolioPositionUpsertDto } from '@shared/contracts/api'

type CloudRow = Record<string, unknown>

/** The external REST boundary only; local repositories and transactions stay real. */
function cloudBoundary() {
  const tables = new Map<string, CloudRow[]>([['portfolio_positions', []], ['watchlist_items', []]])
  return {
    tables,
    client: {
      from(table: string) {
        const filters: Array<(row: CloudRow) => boolean> = []
        let operation = 'select'
        let payload: CloudRow[] = []
        let conflict = 'id'
        const chain = {
          select(_columns: string) { return chain },
          eq(column: string, value: unknown) { filters.push(row => row[column] === value); return chain },
          in(column: string, values: unknown[]) { filters.push(row => values.includes(row[column])); return chain },
          order(_column: string, _options?: unknown) { return chain },
          upsert(rows: CloudRow | CloudRow[], options?: { onConflict?: string }) {
            operation = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]
            conflict = options?.onConflict ?? 'id'; return chain
          },
          insert(rows: CloudRow | CloudRow[]) { operation = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return chain },
          update(row: CloudRow) { operation = 'update'; payload = [row]; return chain },
          delete() { operation = 'delete'; return chain },
          then(resolve: (value: { data: CloudRow[]; error: null }) => unknown) {
            const rows = tables.get(table) ?? []
            const matched = rows.filter(row => filters.every(filter => filter(row)))
            const result = matched.map(row => ({ ...row }))
            if (operation === 'upsert' || operation === 'insert') {
              const keys = conflict.split(',')
              for (const row of payload) {
                const index = operation === 'upsert' ? rows.findIndex(existing => keys.every(key => existing[key] === row[key])) : -1
                if (index < 0) rows.push({ ...row })
                else rows[index] = { ...rows[index], ...row }
              }
            } else if (operation === 'update') {
              for (const row of matched) Object.assign(row, payload[0])
            } else if (operation === 'delete') {
              tables.set(table, rows.filter(row => !matched.includes(row)))
            }
            if (operation !== 'delete') tables.set(table, rows)
            return Promise.resolve(resolve({ data: result, error: null }))
          }
        }
        return chain
      }
    }
  }
}

const position: PortfolioPositionUpsertDto = {
  assetKey: 'STOCK:A_SHARE:601398', assetType: 'STOCK', market: 'A_SHARE', code: '601398',
  name: '工商银行', direction: 'BUY', shares: 100, avgCost: 5,
  tradePrice: 5.2, openedAt: '2025-01-02', riskLevel: 'LOW'
}
const metadata = { tradePrice: 5.2, openedAt: '2025-01-02', riskLevel: 'LOW', corporateActionsAppliedUntil: '2025-07-16' }
const cloudMetadata = { trade_price: 5.2, opened_at: '2025-01-02', risk_level: 'LOW', corporate_actions_applied_until: '2025-07-16' }

describe('在线持仓及同步往返', () => {
  let db: SqliteDatabase
  let cloud: ReturnType<typeof cloudBoundary>
  let local: InstanceType<typeof import('@main/repositories/portfolioRepository')['PortfolioRepository']>
  let online: InstanceType<typeof import('@main/repositories/supabasePortfolioRepository')['SupabasePortfolioRepository']>
  let syncData: typeof import('@main/application/services/dataSyncService')['syncData']

  beforeEach(async () => {
    vi.resetModules()
    db = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await db.exec(`
      CREATE TABLE portfolio_positions (
        id TEXT PRIMARY KEY, asset_key TEXT NOT NULL, asset_type TEXT NOT NULL, market TEXT NOT NULL,
        code TEXT NOT NULL, name TEXT NOT NULL, direction TEXT NOT NULL, shares REAL NOT NULL,
        avg_cost REAL NOT NULL, trade_price REAL, opened_at TEXT, risk_level TEXT,
        corporate_actions_applied_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE watchlist_items (
        asset_key TEXT PRIMARY KEY, asset_type TEXT NOT NULL, market TEXT NOT NULL, code TEXT NOT NULL,
        name TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `)
    cloud = cloudBoundary()
    vi.doMock('@main/infrastructure/db/sqlite', () => ({ getDatabase: () => db }))
    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({ getSupabaseClient: () => cloud.client }))
    vi.doMock('@main/infrastructure/supabase/authService', () => ({ authService: { getSession: async () => ({ user: { id: 'test-user' } }) } }))
    const { PortfolioRepository } = await import('@main/repositories/portfolioRepository')
    const { SupabasePortfolioRepository } = await import('@main/repositories/supabasePortfolioRepository')
    local = new PortfolioRepository()
    online = new SupabasePortfolioRepository()
    ;({ syncData } = await import('@main/application/services/dataSyncService'))
  })

  afterEach(async () => { await db.close() })

  async function localWithMetadata(id = 'position-1', updatedAt = '2025-08-01T00:00:00.000Z') {
    await local.upsert({ ...position, id })
    await db.prepare('UPDATE portfolio_positions SET corporate_actions_applied_until = ?, created_at = ?, updated_at = ? WHERE id = ?')
      .run('2025-07-16', '2025-01-02T00:00:00.000Z', updatedAt, id)
  }

  function seedCloud(id = 'position-1', updatedAt = '2025-08-01T00:00:00.000Z') {
    cloud.tables.get('portfolio_positions')!.push({
      id, user_id: 'test-user', asset_key: 'STOCK:A_SHARE:601398', asset_type: 'STOCK', market: 'A_SHARE',
      code: '601398', name: '工商银行', direction: 'BUY', shares: 100, avg_cost: 5,
      ...cloudMetadata, created_at: '2025-01-02T00:00:00.000Z', updated_at: updatedAt
    })
  }

  it('在线新增只生成一个身份，本地和云端主键相同', async () => {
    await online.upsert(position)
    const saved = await local.list()
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe(cloud.tables.get('portfolio_positions')![0].id)
    await online.remove(saved[0].id)
    expect(await local.list()).toHaveLength(0)
    expect(cloud.tables.get('portfolio_positions')).toHaveLength(0)
  })

  it('在线录入后反复双向同步仍只有一笔持仓', async () => {
    await online.upsert(position)
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect(await local.list()).toHaveLength(1)
    expect(cloud.tables.get('portfolio_positions')).toHaveLength(1)
  })

  it('按资产替换两笔记录后，本地云端保留相同的一笔替换记录', async () => {
    await online.upsert(position)
    await online.upsert({ ...position, shares: 200 })
    await online.replaceByAsset({ asset: { assetKey: 'STOCK:A_SHARE:601398' }, name: '工商银行', shares: 500, avgCost: 5.5, openedAt: '2025-02-01' })
    const saved = await local.list()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ shares: 500, openedAt: '2025-02-01' })
    expect(saved[0].id).toBe(cloud.tables.get('portfolio_positions')![0].id)
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect(await local.list()).toHaveLength(1)
    expect(cloud.tables.get('portfolio_positions')).toHaveLength(1)
  })

  it('推送并重新拉取保留交易价、买入日、风险、除权游标和记录时间', async () => {
    await localWithMetadata()
    expect((await syncData('push')).errors).toEqual([])
    expect(cloud.tables.get('portfolio_positions')![0]).toMatchObject(cloudMetadata)
    await db.exec('DELETE FROM portfolio_positions')
    expect((await syncData('pull')).errors).toEqual([])
    expect((await local.list())[0]).toMatchObject({ ...metadata, createdAt: '2025-01-02T00:00:00.000Z' })
  })

  it('云端拉取完整保存除权状态和版本时间，避免下一次同步反向覆盖', async () => {
    seedCloud()
    expect((await syncData('pull')).errors).toEqual([])
    expect((await local.list())[0]).toMatchObject({ ...metadata, updatedAt: '2025-08-01T00:00:00.000Z' })
    const result = await syncData('bidirectional')
    expect(result.errors).toEqual([])
    expect(result.portfolioPushed).toBe(0)
    expect(result.portfolioPulled).toBe(0)
  })

  it.each([
    '2025-01-02T00:00:00+00:00',
    '2025-01-02T23:30:00-08:00',
    '2025-01-02T00:30:00+08:00'
  ])('在线列表将云端时间戳 %s 保留为原始日历日期，供日期表单直接使用', async (openedAt) => {
    seedCloud()
    cloud.tables.get('portfolio_positions')![0].opened_at = openedAt
    expect((await online.list())[0].openedAt).toBe('2025-01-02')
  })

  it.each(['pull', 'bidirectional'] as const)('%s 保存真实云端时间戳的日历日期，同日除权仍可应用', async (direction) => {
    seedCloud()
    const cloudRow = cloud.tables.get('portfolio_positions')![0]
    cloudRow.opened_at = '2025-01-02T00:30:00+08:00'
    cloudRow.corporate_actions_applied_until = ''
    expect((await syncData(direction)).errors).toEqual([])
    const saved = (await local.list())[0]

    const event = {
      year: 2025, exDate: '2025-01-02', dividendPerShare: 0.2,
      referenceClosePrice: 5, status: 'IMPLEMENTED'
    }
    vi.doMock('@main/repositories/repositoryFactory', () => ({
      getPortfolioRepository: () => local,
      getDividendRepository: () => ({
        listByAsset: async () => [event],
        listPendingCorporateActions: async () => [event]
      })
    }))
    vi.doMock('@main/repositories/assetRepository', () => ({ AssetRepository: class {} }))
    const { applyCorporateActionsToPositions } = await import('@main/application/useCases/applyCorporateActionsToPositions')
    const adjustments = await applyCorporateActionsToPositions()
    expect(adjustments).toHaveLength(1)
    expect((await local.list())[0]).toMatchObject({ avgCost: 4.8, corporateActionsAppliedUntil: '2025-01-02' })
    expect(saved.openedAt).toBe('2025-01-02')
  })

  it('双向合并较新的云端持仓时归一买入日，不把时区带进本地日期字段', async () => {
    await localWithMetadata('position-1', '2025-07-01T00:00:00.000Z')
    seedCloud('position-1', '2025-08-01T00:00:00.000Z')
    cloud.tables.get('portfolio_positions')![0].opened_at = '2025-01-02T23:30:00-08:00'
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect((await local.list())[0].openedAt).toBe('2025-01-02')
  })

  it('编辑同日的云端时区日期时保留已应用的除权游标', async () => {
    await localWithMetadata()
    seedCloud()
    cloud.tables.get('portfolio_positions')![0].opened_at = '2025-01-02T00:30:00+08:00'
    await online.upsert({ ...position, id: 'position-1', riskLevel: 'HIGH' })
    expect(cloud.tables.get('portfolio_positions')![0]).toMatchObject({
      corporate_actions_applied_until: '2025-07-16', risk_level: 'HIGH'
    })
  })

  it('双向合并推送本地独有持仓的完整元数据', async () => {
    await localWithMetadata()
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect(cloud.tables.get('portfolio_positions')![0]).toMatchObject(cloudMetadata)
  })

  it('双向合并拉取云端独有持仓的完整元数据', async () => {
    seedCloud()
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect((await local.list())[0]).toMatchObject(metadata)
  })

  it('相同主键取较新的云端记录时保留元数据及原版本时间', async () => {
    await localWithMetadata('position-1', '2025-07-01T00:00:00.000Z')
    seedCloud('position-1', '2025-08-01T00:00:00.000Z')
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect((await local.list())[0]).toMatchObject({ ...metadata, updatedAt: '2025-08-01T00:00:00.000Z' })
  })

  it('相同主键取较新的本地记录时同步元数据', async () => {
    await localWithMetadata('position-1', '2025-08-01T00:00:00.000Z')
    seedCloud('position-1', '2025-07-01T00:00:00.000Z')
    const row = cloud.tables.get('portfolio_positions')![0]
    row.trade_price = 1; row.opened_at = null; row.risk_level = null; row.corporate_actions_applied_until = null
    expect((await syncData('bidirectional')).errors).toEqual([])
    expect(row).toMatchObject(cloudMetadata)
  })

  it('编辑已除权持仓的风险等级时不重置云端除权游标或创建时间', async () => {
    await localWithMetadata()
    seedCloud()
    await online.upsert({ ...position, id: 'position-1', riskLevel: 'HIGH' })
    expect(cloud.tables.get('portfolio_positions')![0]).toMatchObject({
      corporate_actions_applied_until: '2025-07-16', created_at: '2025-01-02T00:00:00.000Z', risk_level: 'HIGH'
    })
  })

  it('仓库提供的云表建表语句能够存储在线持仓实际发送的字段', async () => {
    await online.upsert(position)
    const schema = readFileSync(resolve('supabase-schema.sql'), 'utf8')
    const createSql = schema.match(/CREATE TABLE IF NOT EXISTS portfolio_positions \([\s\S]*?\n\);/)![0]
      .replace(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/g, '')
      .replace(/DEFAULT now\(\)/g, 'DEFAULT CURRENT_TIMESTAMP')
    const schemaDb = new DatabaseSync(':memory:')
    try {
      schemaDb.exec(createSql)
      const row = cloud.tables.get('portfolio_positions')![0]
      const columns = Object.keys(row)
      schemaDb.prepare(`INSERT INTO portfolio_positions (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
        .run(...columns.map(column => row[column] as string | number | null))
      expect(schemaDb.prepare('SELECT trade_price, risk_level FROM portfolio_positions').get()).toMatchObject({ trade_price: 5.2, risk_level: 'LOW' })
    } finally {
      schemaDb.close()
    }
  })

  it('云表升级在已有持仓上补充交易价与风险字段，可重复执行且不丢旧数据', () => {
    const schema = readFileSync(resolve('supabase-schema.sql'), 'utf8')
    const migrations = [...schema.matchAll(/ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS ([^;]+);/g)]
    const schemaDb = new DatabaseSync(':memory:')
    try {
      schemaDb.exec("CREATE TABLE portfolio_positions (id TEXT PRIMARY KEY, shares REAL); INSERT INTO portfolio_positions VALUES ('existing',100)")
      for (let repeat = 0; repeat < 2; repeat++) {
        for (const [, definition] of migrations) {
          const column = definition.split(/\s+/)[0]
          const columns = schemaDb.prepare('PRAGMA table_info(portfolio_positions)').all()
          if (!columns.some(existing => existing.name === column)) {
            schemaDb.exec(`ALTER TABLE portfolio_positions ADD COLUMN ${definition}`)
          }
        }
      }
      schemaDb.prepare("UPDATE portfolio_positions SET trade_price = ?, risk_level = ? WHERE id = 'existing'").run(5.2, 'LOW')
      expect(schemaDb.prepare('SELECT * FROM portfolio_positions').get()).toMatchObject({ id: 'existing', shares: 100, trade_price: 5.2, risk_level: 'LOW' })
    } finally {
      schemaDb.close()
    }
  })
})
