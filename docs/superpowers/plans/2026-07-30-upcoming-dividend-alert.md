# 即将到账分红提示 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在分红统计页加「即将到账」表区块与「全年估算 / 待入账 / 剩余估算」3 张卡，让用户看到已公告未派发的分红，以及当年预期分红总额。

**Architecture:** 端到端贯穿：domain 实体加 `status` → DB schema 重建唯一键兼容预案 → 适配器去硬过滤 → 新两个 useCase → IPC/HTTP/preload/runtime 链路补 `dividend` 命名空间（顺带把孤岛化 `getHistory` 接入统一 runtime 分发） → renderer 页面加新区块。

**Tech Stack:** TypeScript 5.8 strict / node:sqlite / Vitest / Electron IPC / React + Ant Design 5 / ECharts 5。

## Global Constraints

- 严格遵循分层单向依赖：`domain → application → repositories/adapters → infrastructure`，禁止反向依赖。
- 领域层 `src/main/domain/` 不依赖 Electron、React、Node `node:sqlite`、任何 IO API。
- 路径别名 `@main/*`、`@preload/*`、`@renderer/*`、`@shared/*`。
- 测试用 Vitest，放在 `tests/` 镜像源码目录结构，文件名 `*.test.ts`。
- DB schema 变更走幂等迁移：新建 `migrate*` 函数 → 在 `initializeSchema` 追加调用 → 在 `tests/main/infrastructure/dbMigration.test.ts` 补 `:memory:` 测试。
- 禁止加注释。
- TDD 风格：每个测试先失败再通过。

## File Structure

新建：
- `src/main/adapters/eastmoney/mapAssignProgressToStatus.ts` — 纯函数：东方财富 `ASSIGN_PROGRESS` 文本 → `DividendEvent['status']`
- `src/main/infrastructure/db/migrations/dividendEventStatusMigration.ts` — 加列 + 重建表迁移
- `src/main/application/useCases/listUpcomingDividends.ts` — 待入账用例
- `src/main/application/useCases/getDividendForecast.ts` — 全年预期用例
- `tests/main/adapters/mapAssignProgressToStatus.test.ts`
- `tests/main/repositories/dividendRepository.test.ts`
- `tests/main/infrastructure/dividendEventStatusMigration.test.ts`
- `tests/main/useCases/listUpcomingDividends.test.ts`
- `tests/main/useCases/getDividendForecast.test.ts`

修改：
- `src/main/domain/entities/Stock.ts` — `DividendEvent` 加 `status`、`announcementProgress`
- `src/main/infrastructure/db/sqlite.ts` — 建表 SQL 重写；`initializeSchema` 追加迁移调用
- `src/main/repositories/dividendRepository.ts` — upsert/listBy/listAll 加新列；新增 `listUpcomingByAssetKeys`
- `src/main/adapters/eastmoney/eastmoneyAShareDataSource.ts` — 去掉 `.includes('实施')` 硬过滤、应用 status 映射
- `src/main/adapters/eastmoney/eastmoneyFundDetailDataSource.ts` — 基金 events 设 `status='IMPLEMENTED'`
- `shared/contracts/api.ts` — `DividendMonitorApi` 加 `dividend` 命名空间；新增所有 dividend DTO 类型
- `src/main/application/useCases/listDividendHistory.ts` — type 由 shared re-export
- `src/main/ipc/channels/dividendChannels.ts` — 注册 `dividend:upcoming`、`dividend:forecast`
- `src/main/http/routes/dividendRoutes.ts` — 追加 `POST /api/dividend/upcoming`、`POST /api/dividend/forecast`
- `src/preload/index.ts` — 注入 `dividend` 命名空间桥（getHistory + listUpcoming + getForecast）
- `src/renderer/src/services/desktopApi.ts` — 加 `getDividendDesktopApi`
- `src/renderer/src/services/browserHttpRuntimeApi.ts` — 加 `dividend` 实现
- `src/renderer/src/services/browserRuntimeApi.ts` — 加 `dividend` mock 实现
- `src/renderer/src/services/dividendApi.ts` — 重写为 desktopApi 模式
- `src/renderer/src/pages/DividendCenterPage.tsx` — 顶部 3 张预期卡 + 中间「即将到账」表区块
- `tests/main/infrastructure/dbMigration.test.ts` — 追加 status 迁移断言
- `tests/main/repositories/portfolioRepository.upsert.test.ts`（参照样板存在） — 仅引用，不改动

---

## Task 1: DividendEvent 实体加 status 字段 + 状态映射纯函数

**Files:**
- Modify: `src/main/domain/entities/Stock.ts:17-31`
- Create: `src/main/adapters/eastmoney/mapAssignProgressToStatus.ts`
- Test: `tests/main/adapters/mapAssignProgressToStatus.test.ts`

**Interfaces:**
- Produces: `DividendEvent['status']` union type, `mapAssignProgressToStatus(raw: string | null | undefined): DividendEvent['status']`.
  - `'IMPLEMENTED'`：原文含「实施」
  - `'PLANNED'`：原文含「预案」
  - `'IN_PROGRESS'`：其他非空状态（如「股东大会通过」「董事会通过」「批准」），含「实施」「预案」之外的所有非空文本
  - 若 `raw` 为空串 / null / undefined → 返回 `'PLANNED'`（视为预案兜底，避免数据缺失被误判为实施）

- [ ] **Step 1: 修改 entity 加字段**

修改 `src/main/domain/entities/Stock.ts` 的 `DividendEvent`：

```ts
export type DividendEvent = {
  year: number
  fiscalYear?: string
  announceDate?: string
  recordDate?: string
  exDate?: string
  payDate?: string
  dividendPerShare: number
  totalDividendAmount?: number
  payoutRatio?: number
  referenceClosePrice: number
  bonusSharePer10?: number
  transferSharePer10?: number
  source: string
  status: 'IMPLEMENTED' | 'PLANNED' | 'IN_PROGRESS'
  announcementProgress?: string
}
```

- [ ] **Step 2: 写失败测试**

新建 `tests/main/adapters/mapAssignProgressToStatus.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mapAssignProgressToStatus } from '@main/adapters/eastmoney/mapAssignProgressToStatus'

describe('mapAssignProgressToStatus', () => {
  it('实施 → IMPLEMENTED', () => {
    expect(mapAssignProgressToStatus('实施')).toBe('IMPLEMENTED')
    expect(mapAssignProgressToStatus('实施分配')).toBe('IMPLEMENTED')
  })
  it('预案 → PLANNED', () => {
    expect(mapAssignProgressToStatus('董事会预案')).toBe('PLANNED')
    expect(mapAssignProgressToStatus('预案')).toBe('PLANNED')
  })
  it('其他状态 → IN_PROGRESS', () => {
    expect(mapAssignProgressToStatus('股东大会通过')).toBe('IN_PROGRESS')
    expect(mapAssignProgressToStatus('董事会通过')).toBe('IN_PROGRESS')
    expect(mapAssignProgressToStatus('批准')).toBe('IN_PROGRESS')
  })
  it('空输入兜底为 PLANNED', () => {
    expect(mapAssignProgressToStatus(null)).toBe('PLANNED')
    expect(mapAssignProgressToStatus(undefined)).toBe('PLANNED')
    expect(mapAssignProgressToStatus('')).toBe('PLANNED')
  })
})
```

- [ ] **Step 3: 跑测试看到失败**

Run: `npx vitest run tests/main/adapters/mapAssignProgressToStatus.test.ts`
Expected: FAIL `Cannot find module '@main/adapters/eastmoney/mapAssignProgressToStatus'`

- [ ] **Step 4: 实现纯函数**

新建 `src/main/adapters/eastmoney/mapAssignProgressToStatus.ts`：

```ts
import type { DividendEvent } from '@main/domain/entities/Stock'

export function mapAssignProgressToStatus(raw: string | null | undefined): DividendEvent['status'] {
  if (!raw || raw.trim() === '') return 'PLANNED'
  if (raw.includes('实施')) return 'IMPLEMENTED'
  if (raw.includes('预案')) return 'PLANNED'
  return 'IN_PROGRESS'
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/main/adapters/mapAssignProgressToStatus.test.ts`
Expected: PASS 4 个 it

- [ ] **Step 6: 跑全量 typecheck & test**

Run: `npm run typecheck && npm test`
Expected: 全通过。注意：`Stock.ts` 加 `status` 必选字段会破坏所有现有 `DividendEvent` 字面量构造点；typecheck 会大面积爆错。先不导入这个 task，下一 task 修。

如果 typecheck 报多处「Property 'status' is missing」错误，记录它们的位置作为 Task 2/3 修复点，但 Task 1 commit 时通过临时让 `status` 可选（`status?: DividendEvent['status'] | undefined`）方式过 typecheck。注意这一临时让步的备注记入下个 task 起始步骤。

为简化：**Task 1 把 `status` 设为可选**（`status?: DividendEvent['status']`），等 Task 2/3 补齐所有构造点后在 Task 3 中把字段重设为必选，并在 Task 3 测试中验证无缺省。

修正后 Step 1 的字段应为：

```ts
  status?: 'IMPLEMENTED' | 'PLANNED' | 'IN_PROGRESS'
  announcementProgress?: string
```

- [ ] **Step 7: Commit**

```bash
git add src/main/domain/entities/Stock.ts src/main/adapters/eastmoney/mapAssignProgressToStatus.ts tests/main/adapters/mapAssignProgressToStatus.test.ts
git commit -m "feat(domain): add status/announcementProgress fields to DividendEvent and progress mapping function"
```

---

## Task 2: 适配器去除「实施」硬过滤并应用 status 映射

**Files:**
- Modify: `src/main/adapters/eastmoney/eastmoneyAShareDataSource.ts` — dividend 块（具体行号约 260-300，包含 `.filter((r) => (r.ASSIGN_PROGRESS ?? '').includes('实施'))` 与紧随其后的 `.map` toEvent）
- Modify: `src/main/adapters/eastmoney/eastmoneyFundDetailDataSource.ts` — 给基金 events 设 `status='IMPLEMENTED'`
- Test: 现有 `tests/main/eastmoneyFundDetailDataSource.test.ts` 与可能的 `tests/main/eastmoneyAShareDataSource.test.ts`（若存在）；若次日任务找不到现有适配器单测，新增一个最小测试用 fixture 验证映射

**Interfaces:**
- Consumes: `mapAssignProgressToStatus`、`StockDividendRecord`
- Produces: adapter 的 dividend 区返回的 `DividendEvent[]` 现在带 `status` 字段；与非实施记录并存。其他下游消费者（`applyCorporateActionsToPositions`、`addCorporateActionToPosition` 等）继续只读 `status === 'IMPLEMENTED'` 的事件，不受影响

**重要前置约束**：本 task 完成后，下游消费者不应该误把预案当作已实施来做复权。必须验证 `applyCorporateActionsToPositions.ts` 的过滤条件。若它原本靠 `exDate` 非空来判别（预案 exDate 通常 null），间接自然过滤安全；但 Task 3 修列表查询后可能让 `listByAsset` 漏出非实施记录到复权逻辑中，必须显式加 `status === 'IMPLEMENTED'` 过滤。

- [ ] **Step 1: 检视现状**

用 `read` 看 `src/main/adapters/eastmoney/eastmoneyAShareDataSource.ts:250-320` 找到 dividend 块、`.filter`、toEvent 函数体位置。再 grep `applyCorporateActionsToPositions` 看是否依赖 status：
- Run: `rg -n "status === 'IMPLEMENTED'" src/main/` 看 consumers 是否已用先关字段
- Run: `rg -n "(applyCorporateActionsToPositions|\.exDate|ex_date NOT NULL)" src/main/application src/main/repositories`

- [ ] **Step 2: 写失败测试 — A 股适配器保留 PLANNED/IN_PROGRESS 记录**

新建 `tests/main/adapters/eastmoneyAShareDataSourceDividend.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mapDividendRecordsToEvents } from '@main/adapters/eastmoney/eastmoneyAShareDataSource'

describe('mapDividendRecordsToEvents', () => {
  it('保留非实施记录并给 status', () => {
    const records = [
      { SECURITY_CODE: '600519', REPORT_DATE: '2025-01', PLAN_NOTICE_DATE: '2025-04-01', PRETAX_BONUS_RMB: 0.5, DIVIDENT_RATIO: 12, ASSIGN_PROGRESS: '实施', EX_DIVIDEND_DATE: '2025-07-01', BONUS_RATIO: 0, BONUS_IT_RATIO: 0 },
      { SECURITY_CODE: '600519', REPORT_DATE: '2026-01', PLAN_NOTICE_DATE: '2026-04-15', PRETAX_BONUS_RMB: 0.5, ASSIGN_PROGRESS: '董事会预案' },
      { SECURITY_CODE: '600519', REPORT_DATE: '2026-01', PLAN_NOTICE_DATE: '2026-06-01', ASSIGN_PROGRESS: '股东大会通过', PRETAX_BONUS_RMB: 0.5 }
    ]
    const events = mapDividendRecordsToEvents(records, { code: '600519', fallbackPrice: 1500 })
    expect(events).toHaveLength(3)
    expect(events.find(e => e.status === 'IMPLEMENTED')).toBeTruthy()
    expect(events.find(e => e.status === 'PLANNED')).toBeTruthy()
    expect(events.find(e => e.status === 'IN_PROGRESS')).toBeTruthy()
    expect(events.find(e => e.status === 'IMPLEMENTED')?.exDate).toBe('2025-07-01')
    expect(events.find(e => e.status === 'PLANNED')?.exDate).toBeUndefined()
  })
})
```

注意：若 `eastmoneyAShareDataSource.ts` 中 dividend 块没把 `mapStockDividendRecordsToEvents` 抽成 export 函数，本 task 必须抽出来 — 这是必要的代码组织改进（满足职责单一）。

- [ ] **Step 3: 跑测试看到失败**

Run: `npx vitest run tests/main/adapters/eastmoneyAShareDataSourceDividend.test.ts`
Expected: FAIL `Cannot find module ...` 或 import name 不存在。

- [ ] **Step 4: 重构 + 实现抽函数**

在 `src/main/adapters/eastmoney/eastmoneyAShareDataSource.ts`：

1. 抽出 dividend 块的 toEvent 逻辑为 export 函数 `mapDividendRecordsToEvents(records: StockDividendRecord[], ctx: { code: string; fallbackPrice: number }): DividendEvent[]`，写在文件内 export。**不导出主流程**而只导出该纯函数，便于单测。
2. 删除 `.filter((r) => (r.ASSIGN_PROGRESS ?? '').includes('实施'))`。
3. 在 `mapDividendRecordsToEvents` 内部，对每条 record 调 `mapAssignProgressToStatus(r.ASSIGN_PROGRESS)`，赋给 `event.status`，并把 `r.ASSIGN_PROGRESS` 原文赋给 `event.announcementProgress`。
4. 预案 record 没有 `EX_DIVIDEND_DATE` 时，`exDate` 跳过赋值（保持 undefined，不赋空串）；保留 `announceDate = r.PLAN_NOTICE_DATE`；`recordDate`、`payDate` 同样按 undefined 处理。
5. 缺 `PRETAX_BONUS_RMB` 的预案：`dividendPerShare` 用 `r.PRETAX_BONUS_RMB ?? 0`（预案可能预算未定）。
6. 缺 `referenceClosePrice` 或为 0 时用 `ctx.fallbackPrice`。

- [ ] **Step 5: 跑测试通过**

Run: `npx vitest run tests/main/adapters/eastmoneyAShareDataSourceDividend.test.ts`
Expected: PASS

- [ ] **Step 6: 验证下游消费者未误漏非实施**

检查 `applyCorporateActionsToPositions.ts` 等 consumers，确保只处理 `status === 'IMPLEMENTED'` 或 `exDate !== undefined && exDate !== null`。如有缺失，**补过滤条件**并通过一次性 typecheck/test 验证。

- [ ] **Step 7: 基金 events 也加 status='IMPLEMENTED'**

找到 `src/main/adapters/eastmoney/eastmoneyFundDetailDataSource.ts` 中 `parseFundDividendEvents` 或对应 toEvent 函数，给每条 event 显式赋 `status: 'IMPLEMENTED'`（基金接口的 HTML 解析默认都是已实施文本）。

修改 `parseFundDividendEvents`（或同名函数）让生成的 event literal 含 `status: 'IMPLEMENTED'`。

跑相关测试 `npx vitest run tests/main/eastmoneyFundDetailDataSource.test.ts`，若断了断言匹配新字段，加进 fixture 后通过。

- [ ] **Step 8: 全量 typecheck & test**

Run: `npm run typecheck && npm test`
Expected: 全部通过

- [ ] **Step 9: Commit**

```bash
git add src/main/adapters src/main/repositories tests/main
git commit -m "feat(adapters): preserve non-implemented dividends and map ASSIGN_PROGRESS to status"
```

---

## Task 3: DB schema 重建表迁移 + Repository 改造 + 新增 listUpcomingByAssetKeys

**Files:**
- Create: `src/main/infrastructure/db/migrations/dividendEventStatusMigration.ts`
- Modify: `src/main/infrastructure/db/sqlite.ts` — `createBaseSchema` 建表 SQL + `initializeSchema` 追加迁移调用
- Modify: `src/main/repositories/dividendRepository.ts`
- Test: `tests/main/infrastructure/dividendEventStatusMigration.test.ts`, `tests/main/repositories/dividendRepository.test.ts`
- Test: `tests/main/infrastructure/dbMigration.test.ts` 追加断言

**Interfaces:**
- Consumes: `DividendEvent` with optional `status`
- Produces:
  - DB schema：`dividend_events` 表新结构：
    - 列加 `status TEXT NOT NULL DEFAULT 'IMPLEMENTED'`、`announcement_progress TEXT`
    - 主键改为 `id INTEGER PRIMARY KEY AUTOINCREMENT`（去掉复合 PK）
    - UNIQUE 约束：`UNIQUE(asset_key, announce_date, fiscal_year)` —— 兼容预案（announce_date 在 adapter 中已保证非空）
  - `DividendEventRow` 返回类型新增 `status`, `announcement_progress`
  - `DividendRepository.upsertMany` 接受并落 `status`、`announcement_progress`
  - `DividendRepository.listByAsset(key)` 返回带新字段
  - `DividendRepository.listAll(req)` 返回带新字段
  - `DividendRepository.listUpcomingByAssetKeys(assetKeys: string[], sinceYear?: number): DividendEventWithAsset[]` 新增 — 仅返回 `status != 'IMPLEMENTED'` 的 events
  - Task 完成后，把 `Stock.ts` 的 `status` 字段从可选改为必选

- [ ] **Step 1: 写迁移函数 + 失败测试**

新建 `src/main/infrastructure/db/migrations/dividendEventStatusMigration.ts`：

```ts
import type { DatabaseSync } from 'node:sqlite'

export function migrateDividendEventStatus(db: DatabaseSync): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dividend_events'").all() as Array<{ name: string }>
  if (tables.length === 0) return

  const cols = db.prepare('PRAGMA table_info(dividend_events)').all() as Array<{ name: string }>
  const hasStatus = cols.some((c) => c.name === 'status')

  if (!hasStatus) {
    db.exec(`
      BEGIN;
      CREATE TABLE dividend_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_key TEXT NOT NULL,
        year INTEGER NOT NULL,
        fiscal_year INTEGER,
        announce_date TEXT NOT NULL,
        record_date TEXT,
        ex_date TEXT,
        pay_date TEXT,
        dividend_per_share REAL NOT NULL,
        total_dividend_amount REAL,
        payout_ratio REAL,
        reference_close_price REAL NOT NULL,
        bonus_share_per10 REAL,
        transfer_share_per10 REAL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'IMPLEMENTED',
        announcement_progress TEXT,
        UNIQUE(asset_key, announce_date, fiscal_year)
      );

      INSERT INTO dividend_events_new (
        asset_key, year, fiscal_year, announce_date, record_date, ex_date, pay_date,
        dividend_per_share, total_dividend_amount, payout_ratio, reference_close_price,
        bonus_share_per10, transfer_share_per10, source, fetched_at, status, announcement_progress
      )
      SELECT
        asset_key, year, fiscal_year,
        COALESCE(announce_date, ex_date, '1970-01-01') AS announce_date,
        record_date, ex_date, pay_date,
        dividend_per_share, total_dividend_amount, payout_ratio, reference_close_price,
        bonus_share_per10, transfer_share_per10, source, fetched_at,
        'IMPLEMENTED' AS status,
        NULL AS announcement_progress
      FROM dividend_events;

      DROP TABLE dividend_events;
      ALTER TABLE dividend_events_new RENAME TO dividend_events;
      CREATE INDEX IF NOT EXISTS idx_dividend_events_asset_key ON dividend_events(asset_key);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_ex_date ON dividend_events(ex_date);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events(status);
      COMMIT;
    `)
  }
}
```

新建 `tests/main/infrastructure/dividendEventStatusMigration.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { migrateDividendEventStatus } from '@main/infrastructure/db/migrations/dividendEventStatusMigration'

describe('migrateDividendEventStatus', () => {
  function buildLegacySchema() {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE dividend_events (
        asset_key TEXT NOT NULL,
        year INTEGER NOT NULL,
        fiscal_year INTEGER,
        announce_date TEXT,
        record_date TEXT,
        ex_date TEXT,
        pay_date TEXT,
        dividend_per_share REAL NOT NULL,
        total_dividend_amount REAL,
        payout_ratio REAL,
        reference_close_price REAL NOT NULL,
        bonus_share_per10 REAL,
        transfer_share_per10 REAL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (asset_key, ex_date)
      );
    `)
    return db
  }

  it('迁移加 status / announcement_progress 列并搬数据', () => {
    const db = buildLegacySchema()
    db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2024, '2024-07-01', '2024-07-15', 0.5, 1500, 'eastmoney', '2024-08-01T00:00:00Z')

    migrateDividendEventStatus(db)

    const row = db.prepare('SELECT status, announcement_progress, announce_date FROM dividend_events WHERE asset_key = ?').get('STOCK:A_SHARE:600519') as any
    expect(row.status).toBe('IMPLEMENTED')
    expect(row.announcement_progress).toBeNull()
    expect(row.announce_date).toBe('2024-07-01')
  })

  it('旧 announce_date 为 null 时用 ex_date 兜底填 announce_date', () => {
    const db = buildLegacySchema()
    db.prepare(`INSERT INTO dividend_events (asset_key, year, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2023, '2023-07-15', 0.5, 1500, 'eastmoney', '2023-08-01T00:00:00Z')

    migrateDividendEventStatus(db)

    const row = db.prepare('SELECT announce_date FROM dividend_events WHERE asset_key = ?').get('STOCK:A_SHARE:600519') as any
    expect(row.announce_date).toBe('2023-07-15')
  })

  it('空库迁移不爆错（已建新表则幂等）', () => {
    const db = new DatabaseSync(':memory:')
    expect(() => migrateDividendEventStatus(db)).not.toThrow()
  })

  it('二次迁移幂等', () => {
    const db = buildLegacySchema()
    db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2023, '2023-07-01', '2023-07-15', 0.5, 1500, 'eastmoney', '2023-08-01T00:00:00Z')

    migrateDividendEventStatus(db)
    expect(() => migrateDividendEventStatus(db)).not.toThrow()

    const cnt = db.prepare('SELECT COUNT(*) as n FROM dividend_events').get() as any
    expect(cnt.n).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run tests/main/infrastructure/dividendEventStatusMigration.test.ts`
Expected: FAIL `Cannot find module`

- [ ] **Step 3: 实现迁移函数（写入 Step 1 的代码）**

把 Step 1 中给的 `dividendEventStatusMigration.ts` 文件内容写入；运行测试。

Run: `npx vitest run tests/main/infrastructure/dividendEventStatusMigration.test.ts`
Expected: PASS

- [ ] **Step 4: 让 `createBaseSchema` 用新结构建表（新机器一次性建表）**

修改 `src/main/infrastructure/db/sqlite.ts` 的 `dividend_events` CREATE TABLE，从原 `PRIMARY KEY (asset_key, ex_date)` 改为：

```ts
    CREATE TABLE IF NOT EXISTS dividend_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_key TEXT NOT NULL,
      year INTEGER NOT NULL,
      fiscal_year INTEGER,
      announce_date TEXT NOT NULL,
      record_date TEXT,
      ex_date TEXT,
      pay_date TEXT,
      dividend_per_share REAL NOT NULL,
      total_dividend_amount REAL,
      payout_ratio REAL,
      reference_close_price REAL NOT NULL,
      bonus_share_per10 REAL,
      transfer_share_per10 REAL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IMPLEMENTED',
      announcement_progress TEXT,
      UNIQUE(asset_key, announce_date, fiscal_year)
    );

    CREATE INDEX IF NOT EXISTS idx_dividend_events_asset_key ON dividend_events(asset_key);
    CREATE INDEX IF NOT EXISTS idx_dividend_events_ex_date ON dividend_events(ex_date);
    CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events(status);
```

- [ ] **Step 5: 在 initializeSchema 追加迁移调用**

`src/main/infrastructure/db/sqlite.ts` 内 `initializeSchema` 函数尾部 `db.exec(...)` 之前追加：

```ts
  migrateDividendEventStatus(db)
```

并在文件顶部 `import` 加 `import { migrateDividendEventStatus } from './migrations/dividendEventStatusMigration'`。

- [ ] **Step 6: 在 `tests/main/infrastructure/dbMigration.test.ts` 加一条断言**

在该文件的合适 `it` 内（或新加一个 `it`）补一行：

```ts
  it('dividend_events 含 status 列且默认 IMPLEMENTED', () => {
    const cols = db.prepare('PRAGMA table_info(dividend_events)').all() as Array<{ name: string; dflt_value: string | null }>
    const s = cols.find((c) => c.name === 'status')
    expect(s).toBeDefined()
    expect(s?.dflt_value).toBe("'IMPLEMENTED'")
  })
```

跑 `npx vitest run tests/main/infrastructure/dbMigration.test.ts`，应通过。

- [ ] **Step 7: 改 dividendRepository.upsertMany / listByAsset / listAll / listPendingCorporateActions**

修改 `src/main/repositories/dividendRepository.ts`：

1. `upsertMany` 的 SQL 改为：

```ts
  const stmt = db.prepare(`
    INSERT INTO dividend_events (
      asset_key, year, fiscal_year, announce_date, record_date, ex_date, pay_date,
      dividend_per_share, total_dividend_amount, payout_ratio, reference_close_price,
      bonus_share_per10, transfer_share_per10, source, fetched_at, status, announcement_progress
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_key, announce_date, fiscal_year) DO UPDATE SET
      year = excluded.year,
      fiscal_year = excluded.fiscal_year,
      record_date = excluded.record_date,
      ex_date = excluded.ex_date,
      pay_date = excluded.pay_date,
      dividend_per_share = excluded.dividend_per_share,
      total_dividend_amount = excluded.total_dividend_amount,
      payout_ratio = excluded.payout_ratio,
      reference_close_price = excluded.reference_close_price,
      bonus_share_per10 = excluded.bonus_share_per10,
      transfer_share_per10 = excluded.transfer_share_per10,
      source = excluded.source,
      fetched_at = excluded.fetched_at,
      status = excluded.status,
      announcement_progress = excluded.announcement_progress
  `)
```

且 `stmt.run` 参数追加 `event.status ?? 'IMPLEMENTED'` 与 `event.announcementProgress ?? null`。

注意：`announce_date` 在 INSERT 时不可为 NULL，但预案 record 已在 adapter 保证 `announce_date` 非空（Task 2 的 `addDate = r.PLAN_NOTICE_DATE` 与既往 record 也都有），所以 `event.announceDate` 必须非空。若 use case / repo 调用方传入空 `announceDate` 需要 fallback 用 `ex_date`：

```ts
  const announceDate = event.announceDate ?? event.exDate ?? '1970-01-01'
```

如果 `announceDate` 与 `ex_date` 都为空且 fiscal_year 也为空，会写入常熟但唯一约束会触发 EX_DIFF 重复。提前在 repo 内 fallback 到 `new Date().getUTCFullYear().toString()` 与 `'1970-01-01'` 不可取（重复入库会冲突），更安全：**断言 announce_date 非空**：若 event 无 announceDate 也无 exDate，throw new Error。

实际处理：在 upsert 时

```ts
const announceDate = event.announceDate ?? event.exDate
if (!announceDate) throw new Error(`DividendEvent upsert: missing announce_date and ex_date for asset ${assetKey}`)
```

2. `listByAsset` SQL 改：

```ts
SELECT *, status, announcement_progress FROM dividend_events WHERE asset_key = ? ORDER BY ex_date ASC, announce_date ASC
```

且 Row map 加：

```ts
status: row.status as DividendEvent['status'],
announcementProgress: row.announcement_progress ?? undefined
```

3. `listAll` SQL 同加 SELECT 两列；Row map 同上。

4. `listPendingCorporateActions` 已经按 ex_date 过滤（仅非实施不动），保持 SQL 不变即可——预案本身 `exDate=null` 不会被该函数返回。但为防万一加 `AND status = 'IMPLEMENTED'`。

- [ ] **Step 8: 写 dividendRepository 测试**

新建 `tests/main/repositories/dividendRepository.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { migrateDividendEventStatus } from '@main/infrastructure/db/migrations/dividendEventStatusMigration'
import { DividendRepository } from '@main/repositories/dividendRepository'
import type { DividendEvent } from '@main/domain/entities/Stock'

function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE dividend_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_key TEXT NOT NULL,
      year INTEGER NOT NULL,
      fiscal_year INTEGER,
      announce_date TEXT NOT NULL,
      record_date TEXT,
      ex_date TEXT,
      pay_date TEXT,
      dividend_per_share REAL NOT NULL,
      total_dividend_amount REAL,
      payout_ratio REAL,
      reference_close_price REAL NOT NULL,
      bonus_share_per10 REAL,
      transfer_share_per10 REAL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IMPLEMENTED',
      announcement_progress TEXT,
      UNIQUE(asset_key, announce_date, fiscal_year)
    );
    CREATE INDEX idx_dividend_events_asset_key ON dividend_events(asset_key);
    CREATE INDEX idx_dividend_events_ex_date ON dividend_events(ex_date);
    CREATE INDEX idx_dividend_events_status ON dividend_events(status);
  `)
  // stub getDatabase to return this db
  // 注意：DividendRepository 内部直接调 getDatabase()，必须 vi.mock 替换
  return db
}

// 由于 DividendRepository 内部固定调 getDatabase()，本测试用 vi.mock 替换。
// 具体实现引用 tests/main/repositories/portfolioRepository.upsert.test.ts 的样板。
```

如果 `DividendRepository` 不易注入 db 构造（沿用全局 `getDatabase()`），改用 `vi.mock('@main/infrastructure/db/sqlite', () => ({ getDatabase: () => globalDbRef }))`，参考样板。在 `tests/main/repositories/portfolioRepository.upsert.test.ts`。

注意：先读 portfolioRepository.upsert.test.ts 看清楚实际的 mock 方式，再照样实现。

测试 case：
- `upsertMany 预案事件能写入（status=PLANNED, ex_date=null）`
- `upsertMany 同 announce_date + fiscal_year 重复写入会 UPDATE 不重复插入`
- `listByAsset 返回带 status / announcement_progress`
- `listUpcomingByAssetKeys 仅返回 status != 'IMPLEMENTED' 的`

- [ ] **Step 9: 实现 `listUpcomingByAssetKeys`**

在 `DividendRepository` 内追加方法：

```ts
  listUpcomingByAssetKeys(assetKeys: string[], sinceYear?: number): DividendEventWithAsset[] {
    if (assetKeys.length === 0) return []
    const db = getDatabase()
    const placeholders = assetKeys.map(() => '?').join(',')
    const params: (string | number)[] = [...assetKeys]
    let sql = `SELECT *, asset_key as "assetKey" FROM dividend_events WHERE status != 'IMPLEMENTED' AND asset_key IN (${placeholders})`
    if (sinceYear !== undefined) {
      sql += ` AND year >= ?`
      params.push(sinceYear)
    }
    sql += ` ORDER BY announce_date DESC`
    const rows = db.prepare(sql).all(...params) as Array<DividendEventRow & { assetKey: string }>
    return rows.map((row) => mapRowToEventWithAsset(row))
  }
```

补 `mapRowToEventWithAsset` helper。注意 `(row) => ({ ..., status: row.status, announcementProgress: row.announcement_progress ?? undefined, assetKey: row.assetKey })`。

- [ ] **Step 10: 跑 repository 测试**

Run: `npx vitest run tests/main/repositories/dividendRepository.test.ts`
Expected: PASS

- [ ] **Step 11: 让 status 字段在 Stock.ts 由可选改必选，修所有现有构造点**

把 `Stock.ts` 的 `status?:` 改为 `status:` 必选，再 grep 所有 `DividendEvent` 字面量构造点：

Run: `rg -n "DividendEvent\b" src/main --type ts`
然后填上 `status: 'IMPLEMENTED'`（即所有 Task 2 之外的复权内部用例与 listDividendHistory 中调用历史 dividend 数据时构造的临时对象 — 但其实历史数据从 repo 来已自带 status，所以大多数情况不该需要补字面量）。

跑 `npm run typecheck` 全过。

- [ ] **Step 12: 全量 typecheck & test**

Run: `npm run typecheck && npm test`
Expected: 全部通过

- [ ] **Step 13: Commit**

```bash
git add src/main/infrastructure src/main/repositories src/main/domain tests
git commit -m "feat(persistence): rebuild dividend_events schema for planned dividends and add listUpcomingByAssetKeys"
```

---

## Task 4: shared/contracts dividend 命名空间 + 三 runtime + renderer service 迁移 getHistory

**Files:**
- Modify: `shared/contracts/api.ts` — `DividendMonitorApi` 加 `dividend` 命名空间；新增 dividend DTO 类型
- Modify: `src/main/application/useCases/listDividendHistory.ts` — `DividendHistoryRequest/Result` 改为从 shared re-export
- Modify: `src/preload/index.ts` — 注入 `dividend` 命名空间桥（`getHistory`，**预留** `listUpcoming`/`getForecast` 调用同名 IPC，但本 task 只实现 `getHistory`）
- Modify: `src/renderer/src/services/desktopApi.ts` — 加 `getDividendDesktopApi`
- Modify: `src/renderer/src/services/browserHttpRuntimeApi.ts` — 加 `dividend` 实现
- Modify: `src/renderer/src/services/browserRuntimeApi.ts` — 加 `dividend` mock 实现
- Modify: `src/renderer/src/services/dividendApi.ts` — 重写为 desktopApi 模式（仅 getHistory 接入 desktopApi）
- Test: `tests/renderer/dividendApi.test.ts`（如果项目已有 renderer service 测试样板；若无，本次不强制新建 — 上一 task + T7 端到端在 mock runtime 下可验证）

**Interfaces:**
- Produces:
  - `DividendMonitorApi.dividend`：`{ getHistory(req?): Promise<DividendHistoryResult>; listUpcoming(req?): Promise<UpcomingDividendDto[]>; getForecast(req?): Promise<DividendForecastDto> }`
  - 合约类型：`DividendHistoryRequest`, `DividendHistoryItem`, `DividendYearlySummary`, `DividendMonthlyTrend`, `DividendAssetSummary`, `DividendHistoryResult`, `UpcomingDividendDto`, `DividendForecastDto`，全部在 `shared/contracts/api.ts` 定义并 export，useCase/renderer 凡引用均改 `import from '@shared/contracts/api'`
  - 当前 task 内 `listUpcoming` / `getForecast` 的三 runtime 实现暂 throw `new Error('not yet implemented: dividend.listUpcoming — see Task 7')`，待 Task 7 替换为真实调用
  - preload 暴露 `window.dividendMonitor.dividend.getHistory` 走 IPC channel `dividend:history`

- [ ] **Step 1: shared/contracts 定义 dividend 命名空间**

在 `shared/contracts/api.ts` 加一段（不删原 `DividendEventDto`）：

```ts
export type DividendHistoryRequest = {
  fromDate?: string
  toDate?: string
  assetKeys?: string[]
}

export type DividendHistoryItem = {
  assetKey: string
  assetName: string
  code: string
  year: number
  exDate: string
  dividendPerShare: number
  bonusSharePer10?: number
  transferSharePer10?: number
  referenceClosePrice: number
  heldShares: number
  estimatedDividendAmount: number
}

export type DividendYearlySummary = { year: number; totalAmount: number; eventCount: number; assetCount: number }
export type DividendMonthlyTrend = { month: string; amount: number }
export type DividendAssetSummary = { assetKey: string; assetName: string; code: string; totalAmount: number; eventCount: number; latestExDate?: string }

export type DividendHistoryResult = {
  items: DividendHistoryItem[]
  yearlySummary: DividendYearlySummary[]
  monthlyTrend: DividendMonthlyTrend[]
  assetSummary: DividendAssetSummary[]
  totalAmount: number
}

export type UpcomingDividendDto = {
  assetKey: string
  assetType: 'STOCK' | 'ETF' | 'FUND'
  code: string
  name: string
  heldShares: number
  announceDate?: string
  expectedExDate?: string
  expectedPayDate?: string
  dividendPerShare: number
  announcementProgress: string
  status: 'PLANNED' | 'IN_PROGRESS'
  estimatedAmount: number
}

export type DividendForecastDto = {
  year: number
  annualEstimatedTotal: number
  yearToDateActual: number
  upcomingPlanned: number
  remainingEstimated: number
  details: {
    upcoming: UpcomingDividendDto[]
  }
}
```

在 `DividendMonitorApi` 接口加 `dividend` 命名空间：

```ts
export interface DividendMonitorApi {
  // ...原有命名空间
  dividend: {
    getHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult>
    listUpcoming(): Promise<UpcomingDividendDto[]>
    getForecast(): Promise<DividendForecastDto>
  }
}
```

- [ ] **Step 2: 改 listDividendHistory.ts 类型来源**

把 `listDividendHistory.ts` 中的 type 定义全部删除，改为：

```ts
import type { DividendHistoryRequest, DividendHistoryResult } from '@shared/contracts/api'
// 函数签名相同，return 的语义不变
export async function listDividendHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult> { ... }
```

再 re-export 类型让旧 import 路径仍能用：

```ts
export type { DividendHistoryRequest, DividendHistoryResult, DividendHistoryItem, DividendYearlySummary, DividendMonthlyTrend, DividendAssetSummary } from '@shared/contracts/api'
```

- [ ] **Step 3: 加 preload dividend 桥（仅 getHistory）**

修改 `src/preload/index.ts`，在 `api` 对象末尾加：

```ts
  dividend: {
    getHistory(request?: DividendHistoryRequest) {
      return ipcRenderer.invoke('dividend:history', request)
    },
    listUpcoming() {
      return ipcRenderer.invoke('dividend:upcoming')
    },
    getForecast() {
      return ipcRenderer.invoke('dividend:forecast')
    }
  },
```

同时在文件顶部 import `{ DividendHistoryRequest }` from `'@shared/contracts/api'`。注意 `listUpcoming`/`getForecast` 的 IPC channel 在 Task 7 才真正注册，在主进程未注册时 `ipcRenderer.invoke` 会一直挂起。本 task 桌面用户**只调 `getHistory`**，不调 upcoming/forecast，不会有问题；Task 7 注册后即可用。

- [ ] **Step 4: 在 desktopApi 加 `getDividendDesktopApi`**

`src/renderer/src/services/desktopApi.ts` 末尾加：

```ts
export function getDividendDesktopApi(): DividendMonitorApi['dividend'] {
  const api = getRuntimeApi()
  if (!api.dividend) {
    throw new Error('Runtime API is missing the dividend namespace.')
  }
  return api.dividend
}
```

- [ ] **Step 5: 在 browserHttpRuntimeApi 加 `dividend` 命名空间**

`src/renderer/src/services/browserHttpRuntimeApi.ts` 加：

```ts
  dividend: {
    getHistory(request?: DividendHistoryRequest) {
      return postJson<DividendHistoryResult>('/api/dividend/history', request ?? {})
    },
    listUpcoming() {
      return postJson<UpcomingDividendDto[]>('/api/dividend/upcoming', {})
    },
    getForecast() {
      return postJson<DividendForecastDto>('/api/dividend/forecast', {})
    }
  },
```

注意：浏览器预览 mock 模式不会调这三个端点，浏览器预览 HTTP 模式（默认）会调。HTTP 路由 Task 7 才注册 upcoming/forecast；本 task 调用会 404，但浏览器 mock 模式下不会调 HTTP 而调 mock fixture，浏览器 HTTP 模式只在调用时才会 404。

- [ ] **Step 6: 在 browserRuntimeApi 加 `dividend` 命名空间**

mock 实现，参考 `browserRuntimeApi.ts` 已有的 mock fixture 写法。给 dividend 命名空间加：

```ts
  dividend: {
    async getHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult> {
      // 在已有 mock 数据中筛 — 假设项目 mock 已有 detail.dividendEvents
      // 简化版：返回空 result（保证空状态 UI 显示）
      return { items: [], yearlySummary: [], monthlyTrend: [], assetSummary: [], totalAmount: 0 }
    },
    async listUpcoming(): Promise<UpcomingDividendDto[]> {
      return []
    },
    async getForecast(): Promise<DividendForecastDto> {
      return {
        year: new Date().getFullYear(),
        annualEstimatedTotal: 0,
        yearToDateActual: 0,
        upcomingPlanned: 0,
        remainingEstimated: 0,
        details: { upcoming: [] }
      }
    }
  },
```

mock 模式默认返回空数据，UI 显示"当前无已公告未派发的分红预案" 与 待入账 0。

- [ ] **Step 7: 重写 renderer dividendApi.ts 走 desktopApi**

`src/renderer/src/services/dividendApi.ts` 全文重写：

```ts
import { getDividendDesktopApi } from '@renderer/services/desktopApi'
import type {
  DividendHistoryRequest,
  DividendHistoryResult,
  UpcomingDividendDto,
  DividendForecastDto
} from '@shared/contracts/api'

export const dividendApi = {
  getHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult> {
    return getDividendDesktopApi().getHistory(request)
  },
  listUpcoming(): Promise<UpcomingDividendDto[]> {
    return getDividendDesktopApi().listUpcoming()
  },
  getForecast(): Promise<DividendForecastDto> {
    return getDividendDesktopApi().getForecast()
  }
}

export type {
  DividendHistoryRequest,
  DividendHistoryResult,
  UpcomingDividendDto,
  DividendForecastDto
} from '@shared/contracts/api'
```

- [ ] **Step 8: 跑全量 typecheck & test**

Run: `npm run typecheck && npm test`
Expected: 全部通过

注意：若有旧用 `DividendApi` 类型的旧路径，会因 `import type { DividendHistoryResult } from '@renderer/services/dividendApi'` 而继续工作（re-export）。如果在某文件没 reload，会有 lint/typecheck 报错，按指引更新 import。

- [ ] **Step 9: Commit**

```bash
git add shared/contracts/api.ts src/preload src/main/application src/renderer/src/services
git commit -m "feat(contracts): add DividendMonitorApi.dividend namespace and migrate dividendApi to runtime dispatch"
```

---

## Task 5: 新增 listUpcomingDividends 用例 + TDD

**Files:**
- Create: `src/main/application/useCases/listUpcomingDividends.ts`
- Create: `tests/main/useCases/listUpcomingDividends.test.ts`

**Interfaces:**
- Consumes:
  - `PortfolioRepository.list()` → `PortfolioPositionDto[]`
  - `DividendRepository.listUpcomingByAssetKeys(assetKeys: string[], sinceYear?: number)` → `DividendEventWithAsset[]`
- Produces:
  - `listUpcomingDividends(): Promise<UpcomingDividendDto[]>`
  - 内部聚合持仓 → assetKey 净数（参考 `listDividendHistory.ts` 即有聚合逻辑）；按照持仓 assetKey 列表调 `listUpcomingByAssetKeys`
  - 对库内无数据的资产，本 task 不主动 refresh（推迟到 Task 7 或风险记录至 §11 留待后续优化）
  - 当前年份默认 `new Date().getFullYear()`

- [ ] **Step 1: 写失败测试**

`tests/main/useCases/listUpcomingDividends.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 见 portfolioRepository.upsert.test.ts 同样 mock 方式 vi.mock getPortfolioRepository / DividendRepository
vi.mock('@main/repositories/repositoryFactory', () => ({
  getPortfolioRepository: () => ({ list: vi.fn(async () => mockPositions) })
}))
vi.mock('@main/repositories/dividendRepository', () => ({
  DividendRepository: vi.fn().mockImplementation(() => ({
    listUpcomingByAssetKeys: vi.fn((keys: string[], sinceYear?: number) =>
      mockEvents.filter(e => keys.includes(e.assetKey) && (sinceYear === undefined || e.year >= sinceYear))
    )
  }))
}))

let mockPositions: any[] = []
let mockEvents: any[] = []

describe('listUpcomingDividends', () => {
  beforeEach(() => {
    mockPositions = [
      { id: '1', assetKey: 'STOCK:A_SHARE:600519', assetType: 'STOCK', market: 'A_SHARE', code: '600519', name: '贵州茅台', direction: 'BUY', shares: 1000, avgCost: 1500, openedAt: '2023-01-01', tradePrice: null, riskLevel: null }
    ]
    mockEvents = [
      { assetKey: 'STOCK:A_SHARE:600519', year: 2026, fiscalYear: 2026, announceDate: '2026-04-15', dividendPerShare: 0.5, status: 'PLANNED', announcementProgress: '董事会预案', exDate: undefined, payDate: undefined }
    ]
  })

  it('聚合持仓 + 拉库内 upcoming → 输出估算金额', async () => {
    const { listUpcomingDividends } = await import('@main/application/useCases/listUpcomingDividends')
    const result = await listUpcomingDividends()
    expect(result).toHaveLength(1)
    expect(result[0].estimatedAmount).toBe(500) // 0.5 × 1000
    expect(result[0].status).toBe('PLANNED')
    expect(result[0].heldShares).toBe(1000)
  })

  it('SELL 持仓净额', async () => {
    mockPositions.push({ id: '2', assetKey: 'STOCK:A_SHARE:600519', assetType: 'STOCK', market: 'A_SHARE', code: '600519', name: '贵州茅台', direction: 'SELL', shares: 200, avgCost: 1500, openedAt: '2023-08-01', tradePrice: null, riskLevel: null })
    const { listUpcomingDividends } = await import('@main/application/useCases/listUpcomingDividends')
    const result = await listUpcomingDividends()
    expect(result).toHaveLength(1)
    expect(result[0].heldShares).toBe(800)
    expect(result[0].estimatedAmount).toBe(400)
  })

  it('持仓数为 0 时跳过估算但仍输出条目，estimatedAmount=0', async () => {
    mockPositions[0] = { ...mockPositions[0], direction: 'SELL', shares: 1000, openedAt: '2024-01-01' }
    const { listUpcomingDividends } = await import('@main/application/useCases/listUpcomingDividends')
    const result = await listUpcomingDividends()
    expect(result).toHaveLength(0)
  })
})
```

注意：`vi.mock` hoisting 下不能直接 `mockPositions`/`mockEvents` 引用闭包变量，可能要用 `vi.hoisted`。按项目已有 useCase 测试样板（如 `tests/main/runDividendReinvestmentBacktestForAsset.test.ts`）的具体写法照抄。

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run tests/main/useCases/listUpcomingDividends.test.ts`
Expected: FAIL `Cannot find`

- [ ] **Step 3: 实现 useCase**

`src/main/application/useCases/listUpcomingDividends.ts`：

```ts
import type { UpcomingDividendDto } from '@shared/contracts/api'
import { DividendRepository } from '@main/repositories/dividendRepository'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'

export async function listUpcomingDividends(): Promise<UpcomingDividendDto[]> {
  const portfolioRepo = getPortfolioRepository()
  const positions = await portfolioRepo.list()

  const assetInfo = new Map<string, { name: string; code: string; shares: number; assetType: 'STOCK' | 'ETF' | 'FUND' }>()
  for (const pos of positions) {
    if (!pos.assetKey || !pos.openedAt) continue
    const existing = assetInfo.get(pos.assetKey)
    const shares = (existing?.shares ?? 0) + (pos.direction === 'SELL' ? -pos.shares : pos.shares)
    if (!existing) {
      assetInfo.set(pos.assetKey, { name: pos.name, code: pos.code ?? '', shares: Math.max(0, shares), assetType: pos.assetType })
    } else {
      existing.shares = Math.max(0, shares)
    }
  }

  const heldAssetKeys = [...assetInfo.keys()]
  if (heldAssetKeys.length === 0) return []

  const dividendRepo = new DividendRepository()
  const currentYear = new Date().getFullYear()
  const events = dividendRepo.listUpcomingByAssetKeys(heldAssetKeys, currentYear)

  return events.map((e) => ({
    assetKey: e.assetKey,
    assetType: assetInfo.get(e.assetKey)!.assetType,
    code: assetInfo.get(e.assetKey)!.code,
    name: assetInfo.get(e.assetKey)!.name,
    heldShares: assetInfo.get(e.assetKey)!.shares,
    announceDate: e.announceDate,
    expectedExDate: e.exDate,
    expectedPayDate: e.payDate,
    dividendPerShare: e.dividendPerShare,
    announcementProgress: e.announcementProgress ?? '',
    status: e.status === 'IMPLEMENTED' ? 'PLANNED' : e.status,
    estimatedAmount: e.dividendPerShare * (assetInfo.get(e.assetKey)?.shares ?? 0)
  }))
}
```

注意：上行 `status: e.status === 'IMPLEMENTED' ? 'PLANNED' : e.status` 这是类型保护 — `listUpcomingByAssetKeys` 只返回非实施，但 TS 不知；用 cast 即可，详见 typecheck 输出。

- [ ] **Step 4: 跑测试通过**

Run: `npx vitest run tests/main/useCases/listUpcomingDividends.test.ts`
Expected: PASS

- [ ] **Step 5: 全量 typecheck & test**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/application/useCases/listUpcomingDividends.ts tests/main/useCases/listUpcomingDividends.test.ts
git commit -m "feat(application): add listUpcomingDividends useCase"
```

---

## Task 6: 新增 getDividendForecast 用例 + TDD

**Files:**
- Create: `src/main/application/useCases/getDividendForecast.ts`
- Create: `tests/main/useCases/getDividendForecast.test.ts`

**Interfaces:**
- Consumes:
  - `listUpcomingDividends()` → `UpcomingDividendDto[]`
  - `listDividendHistory({ fromDate, toDate })` → `DividendHistoryResult`
  - `futureYieldEstimator.estimateFutureYield(input)` 与 `.estimateFundFutureYield(input)` — 用于每个持仓资产推 `estimatedDividendPerShare`
  - `AssetRepository`/`AssetQueryDto` → 获取每资产做 futureYield 计算需要的输入（`latestPrice`、`latestTotalShares` 等）。已存在 useCase `estimateFutureYieldForAsset`（IPC `calculation:future-yield-asset`），可直接复用其输出避免重新实现底盘
- Produces: `getDividendForecast(year?: number): Promise<DividendForecastDto>`，年参数默认 `new Date().getFullYear()`

**简化决策**：本 task 直接复用 `estimateFutureYieldForAsset` useCase 现成结果，不重新拼 `estimateFutureYield` 输入。这样：
- 调 `estimateFutureYieldForAsset({ assetType, market, code })` 拿 `FutureYieldResponseDto`
- 取 `estimates.find(e => e.method === 'baseline').estimatedDividendPerShare`（若不可用取 0）
- × 持仓净额 → 累加为 `annualEstimatedTotal`
- `yearToDateActual` 由 `listDividendHistory` 当年区间 filter 汇总得到

- [ ] **Step 1: 调研 estimateFutureYieldForAsset 现成接口**

Run: `rg -n "estimateFutureYieldForAsset" src/main --type ts`

读 `src/main/application/useCases/estimateFutureYieldForAsset.ts` 全文，记下返回类型和取 `estimates` 的 baseline 路径。

- [ ] **Step 2: 写失败测试**

`tests/main/useCases/getDividendForecast.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock listUpcomingDividends
vi.mock('@main/application/useCases/listUpcomingDividends', () => ({
  listUpcomingDividends: vi.fn(async () => mockUpcoming)
}))
// mock listDividendHistory
vi.mock('@main/application/useCases/listDividendHistory', () => ({
  listDividendHistory: vi.fn(async () => mockHistory)
}))
// mock estimateFutureYieldForAsset
vi.mock('@main/application/useCases/estimateFutureYieldForAsset', () => ({
  estimateFutureYieldForAsset: vi.fn(async () => mockFutureYield)
}))
vi.mock('@main/repositories/repositoryFactory', () => ({
  getPortfolioRepository: () => ({ list: vi.fn(async () => mockPositions) })
}))

let mockUpcoming: any[] = []
let mockHistory: any = { items: [], yearlySummary: [], monthlyTrend: [], assetSummary: [], totalAmount: 0 }
let mockFutureYield: any = { estimates: [{ method: 'baseline', estimatedDividendPerShare: 0.5, isAvailable: true, estimatedFutureYield: 0.03 }] }
let mockPositions: any[] = []

describe('getDividendForecast', () => {
  beforeEach(() => {
    mockUpcoming = [
      { assetKey: 'STOCK:A_SHARE:600519', estimatedAmount: 500, status: 'PLANNED' }
    ]
    mockHistory = { items: [], yearlySummary: [{ year: 2026, totalAmount: 1200, eventCount: 1, assetCount: 1 }], monthlyTrend: [], assetSummary: [], totalAmount: 1200 }
    mockPositions = [
      { id: '1', assetKey: 'STOCK:A_SHARE:600519', assetType: 'STOCK', market: 'A_SHARE', code: '600519', name: '贵州茅台', direction: 'BUY', shares: 1000, avgCost: 1500, openedAt: '2023-01-01', tradePrice: null, riskLevel: null }
    ]
  })

  it('计算全年估算=Σ持仓×每股股息率', async () => {
    const { getDividendForecast } = await import('@main/application/useCases/getDividendForecast')
    const result = await getDividendForecast(2026)
    expect(result.year).toBe(2026)
    expect(result.upcomingPlanned).toBe(500)
    expect(result.yearToDateActual).toBe(1200)
    expect(result.annualEstimatedTotal).toBe(500) // 0.5 × 1000
    expect(result.remainingEstimated).toBe(0) // 500 - 1200 - 500 < 0 clamp 0
  })

  it('若 futureYield 不可用则未计入全年估算', async () => {
    mockFutureYield = { estimates: [{ method: 'baseline', estimatedDividendPerShare: 0, isAvailable: false }] }
    const { getDividendForecast } = await import('@main/application/useCases/getDividendForecast')
    const result = await getDividendForecast(2026)
    expect(result.annualEstimatedTotal).toBe(0)
    expect(result.remainingEstimated).toBe(0)
  })
})
```

注意 vi.mock hoisting 同上 task；查项目内既有 useCase 测试样例。

- [ ] **Step 3: 跑测试看到失败**

Run: `npx vitest run tests/main/useCases/getDividendForecast.test.ts`
Expected: FAIL `Cannot find`

- [ ] **Step 4: 实现 useCase**

`src/main/application/useCases/getDividendForecast.ts`：

```ts
import type { DividendForecastDto, UpcomingDividendDto } from '@shared/contracts/api'
import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'
import { listDividendHistory } from '@main/application/useCases/listDividendHistory'
import { estimateFutureYieldForAsset } from '@main/application/useCases/estimateFutureYieldForAsset'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'
import type { AssetQueryDto } from '@shared/contracts/api'

function parseAssetKey(assetKey: string): AssetQueryDto {
  const [assetType, market, code] = assetKey.split(':') as ['STOCK' | 'ETF' | 'FUND', string, string]
  return { assetType, market, code }
}

export async function getDividendForecast(year?: number): Promise<DividendForecastDto> {
  const targetYear = year ?? new Date().getFullYear()
  const portfolioRepo = getPortfolioRepository()
  const positions = await portfolioRepo.list()

  const assetInfo = new Map<string, number>()
  for (const pos of positions) {
    if (!pos.assetKey || !pos.openedAt) continue
    const delta = pos.direction === 'SELL' ? -pos.shares : pos.shares
    assetInfo.set(pos.assetKey, Math.max(0, (assetInfo.get(pos.assetKey) ?? 0) + delta))
  }

  let annualEstimatedTotal = 0
  for (const [assetKey, shares] of assetInfo.entries()) {
    if (shares <= 0) continue
    try {
      const fy = await estimateFutureYieldForAsset(parseAssetKey(assetKey))
      const baseline = fy.estimates.find((e) => e.method === 'baseline')
      const perShare = baseline?.isAvailable ? (baseline?.estimatedDividendPerShare ?? 0) : 0
      annualEstimatedTotal += perShare * shares
    } catch {
      // 不可估的资产跳过
    }
  }

  const history = await listDividendHistory({
    fromDate: `${targetYear}-01-01`,
    toDate: `${targetYear}-12-31`
  })
  const yearToDateActual = history.yearlySummary.find((y) => y.year === targetYear)?.totalAmount ?? 0

  const upcoming: UpcomingDividendDto[] = await listUpcomingDividends()
  const upcomingFiltered = upcoming.filter((u) => Number(String(u.announceDate ?? '').slice(0, 4)) === targetYear || !u.announceDate)
  const upcomingPlanned = upcomingFiltered.reduce((acc, u) => acc + u.estimatedAmount, 0)

  const remainingEstimated = Math.max(0, annualEstimatedTotal - yearToDateActual - upcomingPlanned)

  return {
    year: targetYear,
    annualEstimatedTotal,
    yearToDateActual,
    upcomingPlanned,
    remainingEstimated,
    details: { upcoming: upcomingFiltered }
  }
}
```

注意：`parseAssetKey` 直接 split `STOCK:A_SHARE:600519`；若 `AssetQueryDto` 命名不同（如 `assetType` 是字面量 union 而非 string），用 type cast 处理。

- [ ] **Step 5: 跑测试通过**

Run: `npx vitest run tests/main/useCases/getDividendForecast.test.ts`
Expected: PASS

- [ ] **Step 6: 全量 typecheck & test**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/application/useCases/getDividendForecast.ts tests/main/useCases/getDividendForecast.test.ts
git commit -m "feat(application): add getDividendForecast useCase"
```

---

## Task 7: 端点打通 — IPC channels + HTTP routes + 三 runtime 接入 upcoming/forecast

**Files:**
- Modify: `src/main/ipc/channels/dividendChannels.ts` — 追加 `dividend:upcoming`、`dividend:forecast` channel
- Modify: `src/main/http/routes/dividendRoutes.ts` — 追加 `POST /api/dividend/upcoming`、`POST /api/dividend/forecast`
- Modify: `src/renderer/src/services/browserHttpRuntimeApi.ts` — 无操作（Task 4 已加 dividend 命名空间所有 3 方法签名）
- Modify: `src/renderer/src/services/browserRuntimeApi.ts` — 无操作（Task 4 已加 mock 实现 3 方法）

**Interfaces:**
- Consumes: `listUpcomingDividends()`、`getDividendForecast(year?)`
- Produces: 3 个 dividend 端点对所有 runtime 完全可用（IPC、HTTP、mock）

- [ ] **Step 1: 修改 dividendChannels.ts**

`src/main/ipc/channels/dividendChannels.ts` 改为：

```ts
import { ipcMain } from 'electron'
import { listDividendHistory, type DividendHistoryRequest } from '@main/application/useCases/listDividendHistory'
import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'
import { getDividendForecast } from '@main/application/useCases/getDividendForecast'

export function registerDividendChannels() {
  ipcMain.handle('dividend:history', async (_event, request?: DividendHistoryRequest) => {
    return listDividendHistory(request)
  })
  ipcMain.handle('dividend:upcoming', async () => {
    return listUpcomingDividends()
  })
  ipcMain.handle('dividend:forecast', async (_event, year?: number) => {
    return getDividendForecast(year)
  })
}
```

- [ ] **Step 2: 修改 dividendRoutes.ts**

```ts
import type { ServerResponse } from 'node:http'
import { listDividendHistory, type DividendHistoryRequest } from '@main/application/useCases/listDividendHistory'
import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'
import { getDividendForecast } from '@main/application/useCases/getDividendForecast'
import { sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleDividendRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/dividend/history' && method === 'POST') {
    const request = (body ?? undefined) as DividendHistoryRequest | undefined
    const result = await listDividendHistory(request)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/dividend/history' && method === 'GET') {
    const result = await listDividendHistory()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/dividend/upcoming' && (method === 'POST' || method === 'GET')) {
    const result = await listUpcomingDividends()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/dividend/forecast' && (method === 'POST' || method === 'GET')) {
    const bodyObj = (body ?? {}) as { year?: number }
    const result = await getDividendForecast(bodyObj.year)
    sendJson(response, 200, result)
    return true
  }

  return false
}
```

- [ ] **Step 3: 跑全量 test**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: 手动验证端点 — 浏览器预览模式**

启动浏览器预览模式 `npm run dev:browser-preview`，用浏览器 DevTools 控制台执行：

```js
fetch('/api/dividend/upcoming').then(r => r.json()).then(console.log)
fetch('/api/dividend/forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()).then(console.log)
```

两个端点应分别返回空数组与 `{ annualEstimatedTotal: 0, yearToDateActual: 0, upcomingPlanned: 0, remainingEstimated: 0, details: { upcoming: [] } }`（持仓无数据时）。

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/channels/dividendChannels.ts src/main/http/routes/dividendRoutes.ts
git commit -m "feat(channels): register dividend upcoming/forecast IPC channels and HTTP routes"
```

---

## Task 8: DividendCenterPage 顶部 3 张预期卡 + 中部「即将到账」表区块

**Files:**
- Modify: `src/renderer/src/pages/DividendCenterPage.tsx` — 顶部加 3 卡 + 中部加面板
- Modify: 相关 CSS（若有 `styles/dividendCenter.css` 或在 page 内联）— 增加 `.upcoming-table` / `.forecast-segment` 样式（样式 follow 现行 `SummaryPanel` 与 `ledger-metric-*` className 风格）

**Interfaces:**
- Consumes: `dividendApi.listUpcoming()`、`dividendApi.getForecast()`、`dividendApi.getHistory()`
- Produces:
  - 顶部加 3 张卡：`全年估算`、`待入账（N笔）`、`剩余估算`
  - 中部在「分红明细表」之前加 `AppCard title="即将到账（已公告未除权除息）"`
  - 内置 Table 列：标的 / 代码 / 持仓 / 预案公告日 / 计划除权日 / 方案进度 / 每10股送转 / 估算金额
  - `方案进度` 列加 Tag，颜色按 `status`

- [ ] **Step 1: 读现状结构**

用 `read` 看 `src/renderer/src/pages/DividendCenterPage.tsx` 完整文件（约 350 行），记下 imports 与现有 summaryCards / 顶部布局的精确位置。

- [ ] **Step 2: 写测试（If 适合，最小化）**

由于页面组件单测搭建成本较高且项目可能未大量集成，本 task 不强制新增单测，验证靠手动运行 app（Step 7）。任务: TDD 视实际项目情况而定 — 若项目已有 renderer page snapshot 测试，照样板加一条；否则跨过测试 step 直接实现。

- [ ] **Step 3: 增 imports + state**

在 `DividendCenterPage.tsx` 顶部 imports 加：

```tsx
import type { UpcomingDividendDto, DividendForecastDto } from '@shared/contracts/api'
import { dividendApi } from '@renderer/services/dividendApi'
import { Tag } from 'antd'
```

在已有 `useState` 区域追加：

```tsx
const [upcoming, setUpcoming] = useState<UpcomingDividendDto[]>([])
const [forecast, setForecast] = useState<DividendForecastDto | null>(null)
const [forecastLoading, setForecastLoading] = useState(false)
const [forecastError, setForecastError] = useState<string | null>(null)
```

- [ ] **Step 4: 增 useEffect 拉 upcoming / forecast**

在已有 `useEffect(...)` 后追加：

```tsx
useEffect(() => {
  let cancelled = false
  setForecastLoading(true)
  setForecastError(null)
  Promise.all([dividendApi.listUpcoming(), dividendApi.getForecast()])
    .then(([u, f]) => {
      if (cancelled) return
      setUpcoming(u)
      setForecast(f)
    })
    .catch((err) => {
      if (cancelled) return
      setForecastError(err instanceof Error ? err.message : String(err))
    })
    .finally(() => {
      if (!cancelled) setForecastLoading(false)
    })
  return () => { cancelled = true }
}, [])
```

- [ ] **Step 5: 增 3 张预期卡**

修改 `summaryCards` `useMemo` 改为按 `forecast` 派生额外卡片：原卡保留为前 4 张，后 3 张新增：

```tsx
const summaryCards = useMemo(() => {
  const currentYear = new Date().getFullYear()
  const thisYearAmount = data?.yearlySummary.find((y) => y.year === currentYear)?.totalAmount ?? 0
  const cards = [
    { label: '累计分红（估算）', value: currency.format(data?.totalAmount ?? 0), primary: true },
    { label: `${currentYear}年分红`, value: currency.format(thisYearAmount), primary: false },
    { label: '分红事件数', value: `${data?.items.length ?? 0} 次`, primary: false },
    { label: '涉及标的', value: `${data?.assetSummary.length ?? 0} 只`, primary: false }
  ]
  if (forecast) {
    cards.push(
      { label: `${forecast.year}全年估算`, value: currency.format(forecast.annualEstimatedTotal), primary: true },
      { label: `待入账（${forecast.details.upcoming.length}笔）`, value: currency.format(forecast.upcomingPlanned), primary: false },
      { label: '剩余估算', value: currency.format(forecast.remainingEstimated), primary: false }
    )
  }
  return cards
}, [data, forecast])
```

把渲染处 `gridTemplateColumns: 'repeat(4, 1fr)'` 改为 `repeat(auto-fit, minmax(200px, 1fr))` 以自适应卡片数（7 张会换行）。预先确认现行样式不影响 — 注意 css 类名 `ledger-metric-panel` 还在使用；改 grid 容器 inline style 即可。

- [ ] **Step 6: 中部加「即将到账」面板**

在「分红明细表」`AppCard` 之前插入：

```tsx
<AppCard title="即将到账（已公告未除权除息）">
  {forecastLoading ? (
    <Spin />
  ) : forecastError ? (
    <Empty description={`加载失败：${forecastError}`} />
  ) : upcoming.length === 0 ? (
    <Empty description="当前无已公告未派发的分红预案" />
  ) : (
    <Table
      dataSource={upcoming}
      rowKey={(r) => `${r.assetKey}-${r.announceDate ?? ''}`}
      pagination={false}
      size="small"
      columns={[
        { title: '标的', dataIndex: 'name', width: 140 },
        { title: '代码', dataIndex: 'code', width: 100 },
        { title: '持仓', dataIndex: 'heldShares', width: 90, align: 'right' },
        { title: '预案公告日', dataIndex: 'announceDate', width: 120, render: (v?: string) => v ?? '—' },
        { title: '计划除权日', dataIndex: 'expectedExDate', width: 120, render: (v?: string) => v ?? '待定' },
        {
          title: '方案进度',
          dataIndex: 'announcementProgress',
          width: 130,
          render: (text: string, r: UpcomingDividendDto) => (
            <Tag color={r.status === 'PLANNED' ? 'blue' : 'gold'}>{text}</Tag>
          )
        },
        { title: '每股分红', dataIndex: 'dividendPerShare', width: 110, align: 'right', render: (v: number) => v?.toFixed(4) },
        {
          title: '估算金额',
          dataIndex: 'estimatedAmount',
          width: 130,
          align: 'right',
          render: (v: number) => currency.format(v)
        }
      ]}
    />
  )}
</AppCard>
```

若 `currency.format` 已是 page 内 helper，沿用。若 `AppCard`、`Spin`、`Empty`、`Table` 已 import，沿用。

- [ ] **Step 7: 启动验证**

Run: `npm run dev:browser-preview`

打开浏览器至 `http://localhost:5173?runtime=mock` 验证：
- 顶部从 4 张卡变为 7 张卡（mock 模式下后 3 张应 0/0/0）
- 中部「即将到账」面板应出现空状态「当前无已公告未派发的分红预案」
- 网络面板 Network 应看到 `fetch('/api/dividend/upcoming')` 通过 browserHttpRuntimeApi fallback；mock 模式则 client-side mock 直接返回空，不发请求。

切到 `http://localhost:5173` 默认（HTTP 模式）：
- 后 3 卡加载完毕后显示具体数字（如果持仓为空，仍为 0）
- 即将到账为空时显示空状态
- 无 console error

- [ ] **Step 8: 全量 typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/pages/DividendCenterPage.tsx
git commit -m "feat(ui): add forecast cards and upcoming dividend table to DividendCenterPage"
```

---

## Self-Review Notes

Self review 后修订：本计划 TDD 节奏遵循 spec 范围；未覆盖事项：

1. spec §11 「ETF dividend capability 等是否 MVP 还兼容」 — 已在 Task 2 Step 6-7 内联处理。Task 3 schema 重建保证预案 exDate=null 也能落库（`UNIQUE(asset_key, announce_date, fiscal_year)` 取代复合 PK）。
2. spec §10 「分阶段交付」 — 已与 task 编号对齐：1-3 = 持久化段，4 = 契约段，5-6 = 用例段，7 = 端点段，8 = UI 段。
3. spec §9 「未来 yield 不可用降级」— Task 6 useCase 通过 `isAvailable` 字段跳过资产计入。