# 持仓分组与操作栏图标化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给持仓表加分组 Tab 筛选（复用自选池分组定义，关联解耦自选池外键），操作栏改图标，去掉资产类别 Tag，预留 risk_level 字段。

**Architecture:** 分组关联复用 `watchlist_group_assets` 但迁移去掉对 `watchlist_items` 的外键依赖，使分组独立于自选池/持仓。前端复用 `useWatchlistGroups` hook 和抽离的 `AssetGroupPopover` 组件。`portfolio_positions` 加 `risk_level` 列纯 schema 预留。

**Tech Stack:** Electron 35 + React 18 + TypeScript 5.8 + Ant Design 5 + node:sqlite + Vitest

## Global Constraints

- 路径别名：`@main/*` `@preload/*` `@renderer/*` `@shared/*`
- 测试：`npm test`（vitest run），类型检查：`npm run typecheck`
- 提交规范：conventional commits，不加 Co-Authored-By
- 无 ORM，直接 node:sqlite SQL
- 共享 UI 组件放 `src/renderer/src/components/app/`
- 不加代码注释除非用户要求

---

## Task 1: 数据库迁移 — watchlist_group_assets 解耦外键 + portfolio_positions 加 risk_level

**Files:**
- Modify: `src/main/infrastructure/db/sqlite.ts:190-207`（`initializeSchema` 函数）
- Test: `tests/main/infrastructure/dbMigration.test.ts`（新建）

**Interfaces:**
- Produces: `migrateWatchlistGroupAssetsForeignKey(db)` 和 `migratePortfolioRiskLevelColumn(db)` 两个迁移函数，在 `initializeSchema` 里调用

- [ ] **Step 1: 写失败测试 — 验证迁移后 watchlist_group_assets 无对 watchlist_items 的外键**

```ts
// tests/main/infrastructure/dbMigration.test.ts
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

describe('db migrations', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
  })

  it('watchlist_group_assets 迁移后无对 watchlist_items 的外键', () => {
    // 先建旧 schema（带外键）
    db.exec(`
      CREATE TABLE watchlist_items (
        asset_key TEXT PRIMARY KEY,
        asset_type TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE watchlist_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE watchlist_group_assets (
        group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
        asset_key TEXT NOT NULL REFERENCES watchlist_items(asset_key) ON DELETE CASCADE,
        added_at TEXT NOT NULL,
        PRIMARY KEY (group_id, asset_key)
      );
      INSERT INTO watchlist_items VALUES ('STOCK:A_SHARE:600519','STOCK','A_SHARE','600519','贵州茅台','2026-01-01','2026-01-01');
      INSERT INTO watchlist_groups VALUES ('g1','测试组',NULL,0,'2026-01-01','2026-01-01');
      INSERT INTO watchlist_group_assets VALUES ('g1','STOCK:A_SHARE:600519','2026-01-01');
    `)

    // 执行迁移
    const { migrateWatchlistGroupAssetsForeignKey } = require('../../src/main/infrastructure/db/migrations/watchlistGroupAssetsMigration')
    migrateWatchlistGroupAssetsForeignKey(db)

    // 验证：资产不在 watchlist_items 也能插入分组关联
    db.exec('DELETE FROM watchlist_items WHERE asset_key = ?').run('STOCK:A_SHARE:600519')
    db.prepare('INSERT OR IGNORE INTO watchlist_group_assets VALUES (?,?,?)').run('g1','STOCK:A_SHARE:600519','2026-01-02')
    const row = db.prepare('SELECT asset_key FROM watchlist_group_assets WHERE group_id=? AND asset_key=?').get('g1','STOCK:A_SHARE:600519')
    expect(row).toBeTruthy()

    // 验证：旧数据保留
    const allRows = db.prepare('SELECT * FROM watchlist_group_assets').all()
    expect(allRows.length).toBe(1)
  })

  it('portfolio_positions 加 risk_level 列', () => {
    db.exec(`
      CREATE TABLE portfolio_positions (
        id TEXT PRIMARY KEY,
        asset_key TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        direction TEXT NOT NULL,
        shares REAL NOT NULL,
        avg_cost REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    const { migratePortfolioRiskLevelColumn } = require('../../src/main/infrastructure/db/migrations/portfolioRiskLevelMigration')
    migratePortfolioRiskLevelColumn(db)

    // 验证列存在且默认 NULL
    db.prepare('INSERT INTO portfolio_positions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      'p1','STOCK:A_SHARE:600519','STOCK','A_SHARE','600519','贵州茅台','BUY',100,1500,'2026-01-01','2026-01-01'
    )
    const row = db.prepare('SELECT risk_level FROM portfolio_positions WHERE id=?').get('p1') as { risk_level: string | null }
    expect(row.risk_level).toBeNull()

    // 可写入 LOW/MEDIUM/HIGH
    db.prepare('UPDATE portfolio_positions SET risk_level=? WHERE id=?').run('LOW','p1')
    const updated = db.prepare('SELECT risk_level FROM portfolio_positions WHERE id=?').get('p1') as { risk_level: string }
    expect(updated.risk_level).toBe('LOW')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/infrastructure/dbMigration.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 创建迁移函数文件**

创建 `src/main/infrastructure/db/migrations/watchlistGroupAssetsMigration.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'

export function migrateWatchlistGroupAssetsForeignKey(db: DatabaseSync): void {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='watchlist_group_assets'").get() as { sql: string } | undefined
  if (!tableInfo) return

  // 已经迁移过（无 watchlist_items 外键引用）则跳过
  if (!tableInfo.sql.includes('REFERENCES watchlist_items')) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_group_assets_v2 (
      group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
      asset_key TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (group_id, asset_key)
    );

    INSERT OR IGNORE INTO watchlist_group_assets_v2 (group_id, asset_key, added_at)
    SELECT group_id, asset_key, added_at FROM watchlist_group_assets;

    DROP TABLE watchlist_group_assets;
    ALTER TABLE watchlist_group_assets_v2 RENAME TO watchlist_group_assets;

    CREATE INDEX IF NOT EXISTS idx_watchlist_group_assets_group
      ON watchlist_group_assets(group_id, added_at DESC);
  `)
}
```

创建 `src/main/infrastructure/db/migrations/portfolioRiskLevelMigration.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'

export function migratePortfolioRiskLevelColumn(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(portfolio_positions)').all() as Array<{ name: string }>
  if (columns.some((col) => col.name === 'risk_level')) return

  db.exec('ALTER TABLE portfolio_positions ADD COLUMN risk_level TEXT;')
}
```

- [ ] **Step 4: 在 initializeSchema 里调用迁移**

Modify `src/main/infrastructure/db/sqlite.ts:190-207`，在 `initializeSchema` 函数里加：

```ts
import { migrateWatchlistGroupAssetsForeignKey } from '@main/infrastructure/db/migrations/watchlistGroupAssetsMigration'
import { migratePortfolioRiskLevelColumn } from '@main/infrastructure/db/migrations/portfolioRiskLevelMigration'

function initializeSchema(db: DatabaseSync) {
  createBaseSchema(db)
  migrateLegacyWatchlistTable(db)
  migrateWatchlistAssetTypes(db)
  migrateWatchlistGroupAssetsForeignKey(db)
  migratePortfolioRiskLevelColumn(db)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_items_asset_identity
      ON watchlist_items(asset_type, market, code);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_updated_at
      ON portfolio_positions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_asset_identity
      ON portfolio_positions(asset_key, updated_at DESC);
  `)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/main/infrastructure/dbMigration.test.ts`
Expected: PASS

- [ ] **Step 6: 运行全量测试 + typecheck**

Run: `npm run typecheck && npm test`
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add src/main/infrastructure/db/migrations/ src/main/infrastructure/db/sqlite.ts tests/main/infrastructure/dbMigration.test.ts
git commit -m "feat(db): 解耦 watchlist_group_assets 外键 + 预留 portfolio risk_level 列

- watchlist_group_assets 迁移去掉对 watchlist_items 的外键依赖，分组关联独立
- portfolio_positions 加 risk_level TEXT 列（首期不使用，纯预留）
- 新增 migrations 子目录存放迁移函数"
```

---

## Task 2: DTO 扩展 — PortfolioPositionDto/UpsertDto 加 riskLevel

**Files:**
- Modify: `shared/contracts/api.ts`（`PortfolioPositionDto` 和 `PortfolioPositionUpsertDto` 类型定义）
- Test: 无需单测（纯类型变更，typecheck 验证）

**Interfaces:**
- Produces: `PortfolioPositionDto.riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'`、`PortfolioPositionUpsertDto.riskLevel?`

- [ ] **Step 1: 扩展 DTO 类型**

Modify `shared/contracts/api.ts`，找到 `PortfolioPositionDto`（约 line 48-61）加 `riskLevel`:

```ts
export type PortfolioPositionDto = {
  id: string
  assetKey: AssetKey
  assetType: AssetType
  market: MarketCode
  code: string
  symbol?: string
  name: string
  direction: PortfolioDirectionDto
  shares: number
  avgCost: number
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  updatedAt: string
  createdAt: string
}
```

找到 `PortfolioPositionUpsertDto`（约 line 63-74）加 `riskLevel`:

```ts
export type PortfolioPositionUpsertDto = {
  id?: string
  assetKey?: AssetKey
  assetType?: AssetType
  market?: MarketCode
  code?: string
  symbol?: string
  name: string
  direction?: PortfolioDirectionDto
  shares: number
  avgCost: number
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS（纯加可选字段，不破坏现有）

- [ ] **Step 3: 提交**

```bash
git add shared/contracts/api.ts
git commit -m "feat(contracts): PortfolioPosition DTO 加 riskLevel 可选字段"
```

---

## Task 3: PortfolioRepository 读写 risk_level

**Files:**
- Modify: `src/main/repositories/portfolioRepository.ts:12-24`（PortfolioPositionRow 类型）、`53-66`（list）、`68-113`（upsert）
- Test: `tests/main/repositories/portfolioRepository.upsert.test.ts`（已有，扩展）

**Interfaces:**
- Consumes: Task 2 的 `PortfolioPositionUpsertDto.riskLevel`
- Produces: `PortfolioRepository.list` 返回的 DTO 带 `riskLevel`，`upsert` 写入 `risk_level`

- [ ] **Step 1: 扩展现有测试加 risk_level 读写用例**

在 `tests/main/repositories/portfolioRepository.upsert.test.ts` 末尾加：

```ts
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ... 现有测试保持 ...

describe('PortfolioRepository — risk_level 字段', () => {
  let repo: InstanceType<typeof PortfolioRepository>
  let memoryDb: DatabaseSync

  beforeEach(() => {
    memoryDb = new DatabaseSync(':memory:')
    memoryDb.exec(`
      CREATE TABLE portfolio_positions (
        id TEXT PRIMARY KEY,
        asset_key TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        direction TEXT NOT NULL,
        shares REAL NOT NULL,
        avg_cost REAL NOT NULL,
        risk_level TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    vi.doMock('@main/infrastructure/db/sqlite', () => ({
      getDatabase: () => memoryDb,
      getDatabaseFilePathForDebug: () => ':memory:'
    }))
    const { PortfolioRepository } = await import('@main/repositories/portfolioRepository')
    repo = new PortfolioRepository()
  })

  it('upsert 带 riskLevel 时写入，list 能读回', async () => {
    await repo.upsert({
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      name: '贵州茅台',
      direction: 'BUY',
      shares: 100,
      avgCost: 1500,
      riskLevel: 'LOW'
    })
    const list = await repo.list()
    expect(list[0].riskLevel).toBe('LOW')
  })

  it('upsert 不带 riskLevel 时为 undefined', async () => {
    await repo.upsert({
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      name: '贵州茅台',
      direction: 'BUY',
      shares: 100,
      avgCost: 1500
    })
    const list = await repo.list()
    expect(list[0].riskLevel).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/repositories/portfolioRepository.upsert.test.ts`
Expected: FAIL — list 返回的 DTO 没有 riskLevel 字段

- [ ] **Step 3: 修改 PortfolioRepository 读写 risk_level**

Modify `src/main/repositories/portfolioRepository.ts`:

`PortfolioPositionRow` 类型（line 12-24）加 `risk_level: string | null`:

```ts
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
  risk_level: string | null
  created_at: string
  updated_at: string
}
```

`toDto` 函数（line 35-50）加 riskLevel 映射:

```ts
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
    riskLevel: row.risk_level as 'LOW' | 'MEDIUM' | 'HIGH' | undefined ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
```

`list` 的 SELECT（line 56-61）加 `risk_level`:

```sql
SELECT id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, risk_level, created_at, updated_at
FROM portfolio_positions
ORDER BY updated_at DESC, created_at DESC, id DESC
```

`upsert` 函数（line 68-113）的 INSERT 加 risk_level:

```ts
const riskLevel = request.riskLevel ?? null
// ...
db.prepare(
  `
    INSERT INTO portfolio_positions (
      id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, risk_level, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      asset_key = excluded.asset_key,
      asset_type = excluded.asset_type,
      market = excluded.market,
      code = excluded.code,
      name = excluded.name,
      direction = excluded.direction,
      shares = excluded.shares,
      avg_cost = excluded.avg_cost,
      risk_level = excluded.risk_level,
      updated_at = excluded.updated_at
  `
).run(id, assetKey, assetType, market, code, name, direction, shares, avgCost, riskLevel, existing?.created_at ?? now, now)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/repositories/portfolioRepository.upsert.test.ts`
Expected: PASS

- [ ] **Step 5: 全量测试 + typecheck**

Run: `npm run typecheck && npm test`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add src/main/repositories/portfolioRepository.ts tests/main/repositories/portfolioRepository.upsert.test.ts
git commit -m "feat(portfolio): PortfolioRepository 读写 risk_level 字段"
```

---

## Task 4: SupabasePortfolioRepository 读写 risk_level

**Files:**
- Modify: `src/main/repositories/supabasePortfolioRepository.ts:31-44`（list 映射）、`73-120`（upsert 写入）
- Test: `tests/main/repositories/supabasePortfolioRepository.upsert.test.ts`（已有，扩展）

**Interfaces:**
- Consumes: Task 2 的 DTO
- Produces: 云端 repo 读写 risk_level 与本地一致

- [ ] **Step 1: 扩展 supabase 测试加 risk_level 用例**

在 `tests/main/repositories/supabasePortfolioRepository.upsert.test.ts` 的测试套件里加一个新 it:

```ts
  it('upsert 带 riskLevel 时云端行带 risk_level 字段', async () => {
    await repo.upsert({
      assetKey: 'FUND:A_SHARE:020602',
      assetType: 'FUND',
      market: 'A_SHARE',
      code: '020602',
      name: '易方达中证红利低波动ETF联接A',
      direction: 'BUY',
      shares: 100,
      avgCost: 1.0,
      riskLevel: 'MEDIUM'
    })
    const row = rows.find((r) => r.asset_key === 'FUND:A_SHARE:020602')
    expect(row).toBeTruthy()
    // rows 数组的 UpsertRow 类型需要加 risk_level 字段
    expect((row as any).risk_level).toBe('MEDIUM')
  })
```

同时更新测试文件顶部的 `UpsertRow` 类型加 `risk_level: string | null`，以及 mock 的 insert 分支透传 `risk_level`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/repositories/supabasePortfolioRepository.upsert.test.ts`
Expected: FAIL — risk_level 未透传

- [ ] **Step 3: 修改 SupabasePortfolioRepository 读写 risk_level**

Modify `src/main/repositories/supabasePortfolioRepository.ts`:

`list` 的 DTO 映射（line 31-44）加 riskLevel:

```ts
riskLevel: (row['risk_level'] as 'LOW' | 'MEDIUM' | 'HIGH' | null) ?? undefined,
```

`upsert` 函数的变量准备（line 73-76 附近）加:

```ts
const riskLevel = request.riskLevel ?? null
```

upsert 的 payload（line 107-120）加 `risk_level: riskLevel`:

```ts
await supabase.from('portfolio_positions').upsert({
  id,
  user_id: userId,
  asset_key: assetKey,
  asset_type: assetType,
  market,
  code,
  name,
  direction,
  shares,
  avg_cost: avgCost,
  risk_level: riskLevel,
  created_at: now,
  updated_at: now
}, { onConflict: 'id' })
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/repositories/supabasePortfolioRepository.upsert.test.ts`
Expected: PASS

- [ ] **Step 5: 全量测试 + typecheck**

Run: `npm run typecheck && npm test`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add src/main/repositories/supabasePortfolioRepository.ts tests/main/repositories/supabasePortfolioRepository.upsert.test.ts
git commit -m "feat(portfolio): SupabasePortfolioRepository 读写 risk_level 字段"
```

---

## Task 5: 抽离 AssetGroupPopover 到 components/app/

**Files:**
- Create: `src/renderer/src/components/app/AssetGroupPopover.tsx`
- Modify: `src/renderer/src/components/watchlist/WatchlistTable.tsx:25-142`（移除内联定义，改 import）

**Interfaces:**
- Produces: `AssetGroupPopover` 组件，props: `{ assetKey, groups, getAssetGroupIds, onToggle }`

- [ ] **Step 1: 创建独立组件文件**

创建 `src/renderer/src/components/app/AssetGroupPopover.tsx`，把 `WatchlistTable.tsx:25-142` 的 `AssetGroupPopover` 函数完整搬过来，保持 props 签名不变：

```tsx
import { Popover } from 'antd'
import { useState } from 'react'
import type { WatchlistGroupDto } from '@shared/contracts/api'

export type AssetGroupPopoverProps = {
  assetKey: string
  groups: WatchlistGroupDto[]
  getAssetGroupIds: (assetKey: string) => Promise<string[]>
  onToggle: (groupId: string, add: boolean) => Promise<void>
}

export function AssetGroupPopover({ assetKey, groups, getAssetGroupIds, onToggle }: AssetGroupPopoverProps) {
  // ... 完整复制 WatchlistTable.tsx:36-142 的实现 ...
}
```

- [ ] **Step 2: 修改 WatchlistTable 改为 import**

Modify `src/renderer/src/components/watchlist/WatchlistTable.tsx`:
- 删除 line 25-142 的内联 `AssetGroupPopover` 函数定义
- 顶部 import 加：`import { AssetGroupPopover } from '@renderer/components/app/AssetGroupPopover'`
- 删除不再需要的 `import { Popover } from 'antd'`（若 WatchlistTable 其他地方没用 Popover）

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 全量测试**

Run: `npm test`
Expected: 全部通过（WatchlistTable 行为不变，回归验证）

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/app/AssetGroupPopover.tsx src/renderer/src/components/watchlist/WatchlistTable.tsx
git commit -m "refactor: 抽离 AssetGroupPopover 到 components/app 共用"
```

---

## Task 6: LedgerIcon 新增 edit 图标

**Files:**
- Modify: `src/renderer/src/components/app/LedgerUi.tsx:3`（类型）、`5-97`（图标实现）

**Interfaces:**
- Produces: `LedgerIcon name="edit"` 可用

- [ ] **Step 1: 扩展 LedgerIconName 类型**

Modify `src/renderer/src/components/app/LedgerUi.tsx:3`:

```ts
type LedgerIconName = 'yield' | 'wallet' | 'calendar' | 'recent' | 'analysis' | 'allocation' | 'detail' | 'delete' | 'select' | 'plus' | 'groups' | 'edit'
```

- [ ] **Step 2: 加 edit 图标实现**

在 `LedgerUi.tsx` 的 `groups` 图标实现后（约 line 97 前）加：

```tsx
  if (name === 'edit') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/app/LedgerUi.tsx
git commit -m "feat(ui): LedgerIcon 新增 edit 图标"
```

---

## Task 7: PortfolioTable 操作栏图标化 + 去掉资产类别 Tag

**Files:**
- Modify: `src/renderer/src/components/dashboard/PortfolioTable.tsx`（完整重写操作栏和资产列）

**Interfaces:**
- Consumes: Task 5 的 `AssetGroupPopover`、Task 6 的 `LedgerIcon name="edit"`
- Produces: `PortfolioTable` 新增 props: `groups`, `getAssetGroupIds`, `onToggleAssetGroup`

- [ ] **Step 1: 修改 PortfolioTable props 和操作栏**

Modify `src/renderer/src/components/dashboard/PortfolioTable.tsx`:

顶部 import 加:

```tsx
import { AssetGroupPopover } from '@renderer/components/app/AssetGroupPopover'
import { LedgerIcon } from '@renderer/components/app/LedgerUi'
import type { WatchlistGroupDto } from '@shared/contracts/api'
```

Props 类型加分组相关字段:

```tsx
type PortfolioTableProps = {
  rows: PortfolioRow[]
  groups: WatchlistGroupDto[]
  getAssetGroupIds: (assetKey: string) => Promise<string[]>
  onToggleAssetGroup: (assetKey: string, groupId: string, add: boolean) => Promise<void>
  onGoToDetail: (row: PortfolioRow) => void
  onEdit: (row: PortfolioRow) => void
  onRemove: (row: PortfolioRow) => void
}
```

资产列删除 Tag（去掉 `{record.assetType ? <Tag color="blue">{record.assetType}</Tag> : null}`），保留 AssetAvatar。

操作列改为图标按钮（替换现有文字按钮）:

```tsx
{
  title: '操作',
  render: (_, record) => (
    <Space className="ledger-inline-action-group">
      <AssetGroupPopover
        assetKey={record.assetKey ?? ''}
        groups={groups}
        getAssetGroupIds={getAssetGroupIds}
        onToggle={(groupId, add) => onToggleAssetGroup(record.assetKey ?? '', groupId, add)}
      />
      <button
        type="button"
        className="ledger-inline-action-btn ledger-icon-only"
        onClick={() => onGoToDetail(record)}
        disabled={!record.assetKey && !record.symbol}
        title="查看详情"
      >
        <LedgerIcon name="detail" />
      </button>
      <button
        type="button"
        className="ledger-inline-action-btn ledger-icon-only"
        onClick={() => onEdit(record)}
        title="编辑持仓"
      >
        <LedgerIcon name="edit" />
      </button>
      <button
        type="button"
        className="ledger-inline-action-btn ledger-icon-only is-danger"
        onClick={() => onRemove(record)}
        title="删除持仓"
      >
        <LedgerIcon name="delete" />
      </button>
    </Space>
  )
}
```

移除不再使用的 `Tag` import（若已无其他用处）。

- [ ] **Step 2: 更新 DashboardPage 传 props**

Modify `src/renderer/src/pages/DashboardPage.tsx` 的 `<PortfolioTable>` 调用（约 line 406-411），加分组 props:

```tsx
<PortfolioTable
  rows={rows}
  groups={groups}
  getAssetGroupIds={handleGetAssetGroupIds}
  onToggleAssetGroup={handleToggleAssetGroup}
  onGoToDetail={(row) => goToDetail(row)}
  onEdit={openEdit}
  onRemove={onRemoveRow}
/>
```

（`groups` / `handleGetAssetGroupIds` / `handleToggleAssetGroup` 在 Task 8 添加，此处先确保类型匹配。若 Task 8 未做，先临时传空值占位让 typecheck 过。）

- [ ] **Step 3: typecheck（临时让通过）**

若 Task 8 的 `groups` / `handleGetAssetGroupIds` / `handleToggleAssetGroup` 尚未定义，DashboardPage 会报错。临时在 DashboardPage 加最小占位：

```tsx
const groups: WatchlistGroupDto[] = []
const handleGetAssetGroupIds = async (_assetKey: string): Promise<string[]> => []
const handleToggleAssetGroup = async (_assetKey: string, _groupId: string, _add: boolean): Promise<void> => {}
```

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/dashboard/PortfolioTable.tsx src/renderer/src/pages/DashboardPage.tsx
git commit -m "feat(portfolio): 操作栏图标化 + 去掉资产类别 Tag

- 详情/编辑/删除改为 LedgerIcon 图标按钮
- 新增分组管理 AssetGroupPopover
- 移除 FUND/GOLD/STOCK 文字 Tag，靠 AssetAvatar 区分"
```

---

## Task 8: DashboardPage 集成分组状态和 Tab 筛选

**Files:**
- Modify: `src/renderer/src/pages/DashboardPage.tsx`（加分组 hook、Tab 行、过滤逻辑）

**Interfaces:**
- Consumes: Task 5 的 `AssetGroupPopover`（通过 PortfolioTable）、`useWatchlistGroups` hook

- [ ] **Step 1: 加分组 hook 和状态**

Modify `src/renderer/src/pages/DashboardPage.tsx`:

顶部 import 加:

```tsx
import { useWatchlistGroups } from '@renderer/hooks/useWatchlistGroups'
import { watchlistApi } from '@renderer/services/watchlistApi'
import type { WatchlistGroupDto } from '@shared/contracts/api'
```

组件内加（替换 Task 7 的临时占位）:

```tsx
const {
  groups,
  createGroup,
  updateGroup,
  deleteGroup,
  addToGroup,
  removeFromGroup
} = useWatchlistGroups()

const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
const [assetKeyToGroupIds, setAssetKeyToGroupIds] = useState<Map<string, string[]>>(new Map())
```

- [ ] **Step 2: 加载持仓-分组关联**

在 `usePortfolio` 的 `positions` 变化时加载分组关联:

```tsx
useEffect(() => {
  if (positions.length === 0) {
    setAssetKeyToGroupIds(new Map())
    return
  }
  let disposed = false
  void Promise.allSettled(
    positions.map((p) =>
      p.assetKey ? watchlistApi.getAssetGroupIds(p.assetKey).then((ids) => [p.assetKey, ids] as const) : Promise.reject(new Error('no assetKey'))
    )
  ).then((results) => {
    if (disposed) return
    const next = new Map<string, string[]>()
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        next.set(r.value[0], r.value[1])
      }
    })
    setAssetKeyToGroupIds(next)
  })
  return () => { disposed = true }
}, [positions])
```

- [ ] **Step 3: 分组过滤逻辑**

```tsx
const filteredRows = useMemo(() => {
  if (!activeGroupId) return rows
  return rows.filter((row) => assetKeyToGroupIds.get(row.assetKey ?? '')?.includes(activeGroupId))
}, [rows, activeGroupId, assetKeyToGroupIds])
```

把 `<PortfolioTable rows={rows}>` 改为 `rows={filteredRows}`。

- [ ] **Step 4: 分组 Tab 行 UI**

在 `<PortfolioTable>` 上方加 Tab 行:

```tsx
<div className="ledger-portfolio-group-tabs" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
  <button
    type="button"
    className={`ledger-inline-action-btn ${activeGroupId === null ? 'is-selected' : ''}`}
    onClick={() => setActiveGroupId(null)}
    style={activeGroupId === null ? { background: 'var(--primary, #0052d0)', color: '#fff' } : {}}
  >
    全部
  </button>
  {groups.map((g) => (
    <button
      key={g.id}
      type="button"
      className={`ledger-inline-action-btn ${activeGroupId === g.id ? 'is-selected' : ''}`}
      onClick={() => setActiveGroupId(g.id)}
      style={activeGroupId === g.id ? { background: g.color || 'var(--primary, #0052d0)', color: '#fff' } : {}}
    >
      {g.name}
    </button>
  ))}
  {/* + 新建分组 内联输入 */}
</div>
```

新建分组用内联 input + 回车（参照 WatchlistPage 模式，此处先用最简实现，后续可复用 WatchlistPage 的编辑交互）。

- [ ] **Step 5: 实现 handleGetAssetGroupIds 和 handleToggleAssetGroup**

```tsx
const handleGetAssetGroupIds = useCallback(async (assetKey: string): Promise<string[]> => {
  try {
    return await watchlistApi.getAssetGroupIds(assetKey)
  } catch {
    return []
  }
}, [])

const handleToggleAssetGroup = useCallback(async (assetKey: string, groupId: string, add: boolean) => {
  try {
    if (add) {
      await addToGroup(groupId, assetKey)
    } else {
      await removeFromGroup(groupId, assetKey)
    }
    // 刷新该 assetKey 的分组关联
    const ids = await watchlistApi.getAssetGroupIds(assetKey)
    setAssetKeyToGroupIds((prev) => {
      const next = new Map(prev)
      next.set(assetKey, ids)
      return next
    })
  } catch (err) {
    apiMessage.error(err instanceof Error ? err.message : '分组操作失败')
    throw err
  }
}, [addToGroup, removeFromGroup, apiMessage])
```

移除 Task 7 的临时占位变量。

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: 全量测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 8: 提交**

```bash
git add src/renderer/src/pages/DashboardPage.tsx
git commit -m "feat(portfolio): 持仓表加分组 Tab 筛选

- 复用 useWatchlistGroups hook 共享分组定义
- 加载持仓-分组关联，按 Tab 过滤
- 分组操作后刷新关联映射"
```

---

## Task 9: 集成验证 + 最终全量测试

**Files:**
- 无新文件，纯验证

- [ ] **Step 1: 全量 typecheck + test**

Run: `npm run typecheck && npm test`
Expected: 全部通过

- [ ] **Step 2: 手动验证清单**

启动 `npm run dev`，验证：

1. 持仓表操作栏显示 4 个图标（分组/详情/编辑/删除），hover 有 title 提示
2. 资产列无 FUND/GOLD/STOCK Tag，AssetAvatar 颜色区分正常
3. 点分组图标弹 Popover，勾选/取消分组生效
4. 持仓表上方显示分组 Tab（全部 + 已有分组），点击切换过滤
5. 新建分组后 Tab 出现
6. 自选池页能看到同一套分组（双向共用）
7. 持仓资产不在自选池也能加入分组（外键解耦验证）
8. 编辑图标打开持仓编辑 Modal，保存正常
9. 删除图标删除持仓，刷新正常

- [ ] **Step 3: 提交验证记录（可选）**

如有样式微调，统一提交：

```bash
git add -A
git commit -m "chore(portfolio): 分组 Tab 样式微调"
```

---

## Self-Review 检查

### Spec 覆盖
- §2.1 分组关联解耦 → Task 1 ✓
- §2.2 risk_level 预留列 → Task 1 ✓
- §2.4 DTO 扩展 → Task 2 ✓
- §3.2 repo 读写 risk_level → Task 3、4 ✓
- §4 前端数据层（useWatchlistGroups 复用 + assetKeyToGroupIds）→ Task 8 ✓
- §5.1 分组 Tab 行 → Task 8 ✓
- §5.2 操作栏图标化 → Task 7 ✓
- §5.3 去掉资产类别 Tag → Task 7 ✓
- §5.4 LedgerIcon edit → Task 6 ✓
- §6 AssetGroupPopover 抽离 → Task 5 ✓
- §7 错误边界 → Task 8 的 catch 处理 ✓
- §8 测试 → 各 Task 内 TDD ✓

### 占位符扫描
无 TBD/TODO/待定。

### 类型一致性
- `riskLevel` 类型全程 `'LOW' | 'MEDIUM' | 'HIGH'` ✓
- `AssetGroupPopover` props 签名抽离前后一致 ✓
- `PortfolioTable` 新 props 在 Task 7 定义、Task 8 消费 ✓
