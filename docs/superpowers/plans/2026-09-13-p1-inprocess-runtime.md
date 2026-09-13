# P1 进程内运行时（In-Process Runtime）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 React 渲染层在浏览器环境（`?runtime=inprocess`）中**直接调用 main 的 application/domain 用例**（不经 IPC、不经 HTTP、不经 Electron），在线模式（Supabase 仓储）下完整可用——这是 Android 移植（Capacitor WebView）的运行时地基。

**Architecture:** 四个解耦缝 + 一个映射层。(S1) `sqlite.ts` 去 electron 化：数据库创建逻辑改为可注入 resolver，electron 依赖移入 main 专属 provider 模块；(S2) `authService`/`syncStatusNotifier` 去 electron 化：BrowserWindow 广播改为可注入回调；(S3) Supabase 会话存储按运行时选择（electron main → 文件存储，浏览器 → localStorage 适配器）；(S4) 新增 `inprocessRuntimeApi.ts` 按 HTTP 路由的同名用例直接实现 `DividendMonitorApi` 全部 17 个命名空间；(S5) renderer 构建补 `@main` 别名。浏览器 bundle 中 node 内建模块由 Vite 外部化垫片处理，仅在真实调用时抛错——在线模式下本地仓储不被调用，风险受控。

**Tech Stack:** 既有依赖（无新增）。Vitest（node 环境）测新缝；浏览器预览 + 真实 Supabase 凭据做端到端目检。

**Spec:** `docs/ANDROID-PORT-ASSESSMENT.md` §4.1/§4.3/§6 P1 行；端点映射见本计划 Task 5 附表（源自 2026-09-13 对 http/routes 与 shared/contracts/api.ts 的全量核对）。

## Global Constraints

- **桌面零回归**：Electron 桌面行为不得变化——provider/broadcaster/storage 的默认路径必须与现状等价，浏览器分支仅在非 electron main 环境生效。
- **分层不破坏**：domain 不新增任何 import；application 不得新增 electron/node 静态依赖（现有 3 条链在本计划内消除或收敛为运行时安全形态）。
- `inprocessRuntimeApi` 必须完整满足 `DividendMonitorApi` 类型（typecheck 强制），backup 命名空间显式抛"仅桌面版支持"。
- 分支 `feat/p1-inprocess-runtime`；conventional commits 中文描述；不加 Co-Authored-By；每任务后 `npm run typecheck`，涉测运行聚焦测试，收尾跑全量。
- P1 禁区：不改 IPC/preload 层行为；不动 HTTP 路由；不引入新 npm 依赖；不做 Capacitor（P2）。

---

### Task 1: S1 — sqlite.ts 去 electron 化（可注入数据库 resolver）

**Files:**
- Modify: `src/main/infrastructure/db/sqlite.ts`
- Create: `src/main/infrastructure/db/electronSqliteProvider.ts`
- Modify: `src/main/index.ts`（启动时安装 provider，在其他初始化之前）
- Test: `tests/main/infrastructure/db/databaseResolver.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `setDatabaseResolver(resolve: () => DatabaseSync): void`、`resetDatabaseResolver(): void`（sqlite.ts 导出，供 provider 安装与测试）；`getDatabase()` 语义不变（无 resolver 时抛 `Error('数据库未初始化...')`）。`electronSqliteProvider.ts` 导出 `installElectronSqliteProvider(): void`（幂等）。迁移函数签名不变（`import type { DatabaseSync }` 均为类型导入，可安全进浏览器 bundle）。

- [ ] **Step 1: 写失败测试**（`tests/main/infrastructure/db/databaseResolver.test.ts`）

```ts
import { beforeEach, describe, expect, it } from 'vitest'

const { getDatabase, setDatabaseResolver, resetDatabaseResolver } = await import(
  '@main/infrastructure/db/sqlite'
)

describe('数据库 resolver 注入', () => {
  beforeEach(() => {
    resetDatabaseResolver()
  })

  it('未安装 resolver 时 getDatabase 抛出可识别错误', () => {
    expect(() => getDatabase()).toThrow('数据库未初始化')
  })

  it('安装 resolver 后 getDatabase 返回 resolver 提供的实例并缓存', () => {
    const marker = { __marker: true } as unknown as import('node:sqlite').DatabaseSync
    let calls = 0
    setDatabaseResolver(() => {
      calls += 1
      return marker
    })

    expect(getDatabase()).toBe(marker)
    expect(getDatabase()).toBe(marker)
    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `npx vitest run tests/main/infrastructure/db/databaseResolver.test.ts`，预期 FAIL（导出不存在/仍直接创建连接）。

- [ ] **Step 3: 重构 sqlite.ts**——保持对外导出（`getDatabase`/`closeDatabase`/`getDatabaseFilePathForDebug`/`initializeSchema`/`migrateYieldMapSnapshots` 及各迁移函数）不变，内部改为：

```ts
import type { DatabaseSync } from 'node:sqlite'
// 删除：import { app } from 'electron'
// 删除：import { mkdirSync } from 'node:fs'、import { join } from 'node:path'
//       （这三者随默认路径构建移入 electronSqliteProvider.ts）
// DatabaseSync 从值导入改为类型导入（如当前已是值导入则修改）

let resolveDatabase: (() => DatabaseSync) | null = null
let cached: DatabaseSync | null = null

export function setDatabaseResolver(resolve: () => DatabaseSync): void {
  resolveDatabase = resolve
  cached = null
}

export function resetDatabaseResolver(): void {
  resolveDatabase = null
  cached = null
}

export function getDatabase(): DatabaseSync {
  if (cached) return cached
  if (!resolveDatabase) {
    throw new Error('数据库未初始化：当前运行时未安装数据库 provider（浏览器运行时请使用在线模式仓储）')
  }
  const db = resolveDatabase()
  initializeSchema(db)
  cached = db
  return db
}

export function closeDatabase(): void {
  cached = null
}
```

注意：(a) `getDatabaseFilePath`/`getDatabaseFilePathForDebug` 移到 electronSqliteProvider.ts（删除 sqlite.ts 中对应导出，rg 全仓引用并随迁：`rg "getDatabaseFilePath" src/ tests/`）；(b) `initializeSchema` 内部不改（纯 db 参数）；(c) 现有测试若 mock `@main/infrastructure/db/sqlite` 的 `getDatabase` 不受影响。

- [ ] **Step 4: 新建 `src/main/infrastructure/db/electronSqliteProvider.ts`**（main 专属，application/domain 不得引用）

```ts
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setDatabaseResolver, getDatabaseFilePathForDebug } from './sqlite'

let installed = false

export function getDatabaseFilePath(): string {
  return join(app.getPath('userData'), 'db', 'dividend-monitor.sqlite')
}

/** 安装 Electron 桌面端的 SQLite provider（幂等）。在 main 进程任何 DB 使用之前调用。 */
export function installElectronSqliteProvider(): void {
  if (installed) return
  installed = true
  setDatabaseResolver(() => {
    const filePath = getDatabaseFilePath()
    mkdirSync(join(filePath, '..'), { recursive: true })
    return new DatabaseSync(filePath)
  })
  void getDatabaseFilePathForDebug
}
```

（若 `getDatabaseFilePathForDebug` 随迁则保留其实现并移除上面这行 `void` 占位；以实际迁移动定。）

- [ ] **Step 5: `src/main/index.ts` 顶部（`app.whenReady()` 之前）调用 `installElectronSqliteProvider()`**，并从 sqlite.ts 的导入中移除不再存在的符号。

- [ ] **Step 6: 验证** — `npx vitest run tests/main/infrastructure/db/databaseResolver.test.ts` 通过；`npm test` 全量 436+ 全绿（任何因导出迁移失败的引用由本步骤修复）；`npm run typecheck` 干净。

- [ ] **Step 7: Commit** — `refactor(db): sqlite 去 electron 化，数据库创建改为可注入 resolver`

---

### Task 2: S2 — authService/syncStatusNotifier 去 electron 化（可注入广播器）

**Files:**
- Modify: `src/main/infrastructure/supabase/authService.ts`（删除 `import { BrowserWindow } from 'electron'`，`broadcastAuthChange` 改为调用注入的广播器，默认 no-op）
- Modify: `src/main/infrastructure/supabase/syncStatusNotifier.ts`（同样模式：导出 `setSyncStatusBroadcaster(fn)`，内部向各窗口推送的实现移到注入侧）
- Create: `src/main/infrastructure/supabase/electronBroadcasters.ts`（main 专属：基于 BrowserWindow 的两个广播器实现 + `installElectronBroadcasters(): void`）
- Modify: `src/main/index.ts`（`installElectronBroadcasters()`，在 authService/sync 首次使用前）
- Test: `tests/main/infrastructure/supabase/broadcasters.test.ts`

**Interfaces:**
- Produces: `setAuthStateBroadcaster(fn: (session: AuthSession | null) => void): void`；`setSyncStatusBroadcaster(fn: (status: SyncStatus) => void): void`（签名以现有 `syncStatusNotifier.ts` 的状态类型为准，先读该文件再定）。默认（未注入）为 no-op 且不抛错。`startAuthListener`/`getLastSyncStatus` 等既有导出语义不变。

- [ ] **Step 1: 读 `syncStatusNotifier.ts` 全文**，确认其 electron 用点与状态类型，按同样模式设计注入面（先读后写，不凭猜测）。
- [ ] **Step 2: 写失败测试**（纯 node 环境，无 electron）：注入 fake 广播器后，触发 `broadcastAuthChange` 路径（可通过 `startAuthListener` 的 onAuthStateChange 回调或直接导出的内部函数驱动）断言 fake 被调用；未注入时不抛错。
- [ ] **Step 3: 实现 authService/syncStatusNotifier 的注入化 + electronBroadcasters.ts + index.ts 接线**（BrowserWindow 遍历推送逻辑原样移入 electronBroadcasters.ts）。
- [ ] **Step 4: 验证** — 聚焦测试 + `npm run typecheck` + 全量。
- [ ] **Step 5: Commit** — `refactor(supabase): auth/sync 广播去 electron 化，改为可注入广播器`

---

### Task 3: S3 — Supabase 会话存储按运行时选择

**Files:**
- Read first: `src/main/infrastructure/supabase/sessionStorage.ts` 尾部（`sessionFileStorage` 对象的完整接口形状——方法名/签名以实际为准）
- Create: `src/main/infrastructure/supabase/browserSessionStorage.ts`（localStorage 适配器，实现与 `sessionFileStorage` 相同的接口形状；无任何 node/electron import）
- Modify: `src/main/infrastructure/supabase/supabaseClient.ts`（`storage` 按运行时选择：electron main → `sessionFileStorage`；浏览器 → `browserSessionStorage`）

**Interfaces:**
- Produces: 选择函数 `resolveSessionStorage()`，判定条件 `typeof process !== 'undefined' && !!(process as { versions?: { electron?: string } }).versions?.electron`（浏览器 bundle 中 `process` 为 undefined 时安全走浏览器分支）。supabase-js 的 storage 契约方法（getItem/setItem/removeItem，同步或 Promise 形态以现有 `sessionFileStorage` 为准）。

- [ ] **Step 1: 读 sessionStorage.ts 尾部**，抄录 `sessionFileStorage` 的确切方法签名。
- [ ] **Step 2: 写 browserSessionStorage.ts**（同签名，基于 `localStorage`，键名加 `supabase-session:` 前缀；JSON 序列化与现有文件存储保持一致的值形态）。
- [ ] **Step 3: 改 supabaseClient.ts 选择逻辑**（保留 `sessionFileStorage` 的静态导入——browser bundle 中 Vite 垫片仅在访问其方法时抛错，而选择逻辑保证浏览器不会访问它）。
- [ ] **Step 4: 验证** — `npm run typecheck` + 全量测试 + 手工冒烟：`npm run dev:browser-preview` 默认（HTTP 回退）模式登录页正常加载。
- [ ] **Step 5: Commit** — `refactor(supabase): 会话存储按运行时选择，浏览器走 localStorage 适配器`

---

### Task 4: S5 — renderer 构建补 @main 别名

**Files:**
- Modify: `electron.vite.config.ts`（renderer.resolve.alias 增加 `'@main': resolve('src/main')`）

- [ ] **Step 1: 修改配置**（与 main 段现有别名写法一致）。
- [ ] **Step 2: 验证** — `npm run typecheck` + `npm run dev:browser-preview` 启动正常（renderer 编译通过）。
- [ ] **Step 3: Commit** — `chore(build): renderer 构建补 @main 别名`

---

### Task 5: S4 — inprocessRuntimeApi（17 命名空间直连用例）

**Files:**
- Create: `src/renderer/src/services/inprocessRuntimeApi.ts`
- Modify: `src/renderer/src/services/desktopApi.ts`（`getRuntimeApi()` 在 `browserRuntimeApi` 分支之前增加：`window.location.search.includes('runtime=inprocess')` → `inprocessRuntimeApi`）

**Interfaces:**
- Consumes: `DividendMonitorApi`（`@shared/contracts/api`）；下表用例。Produces: `export const inprocessRuntimeApi: DividendMonitorApi`。

**实现约定（全表适用）：**
1. 方法体 = 直接 `await` 对应用例并返回其 DTO（HTTP 层的 JSON 序列化省略，DTO 对象直传）。
2. 返回 `204` 的写操作 → 返回 `undefined`（与 `browserHttpRuntimeApi` 的 Promise<void> 对齐）。
3. 错误直接抛出（调用方各 hook 已有错误处理）；不复制 HTTP 的 `{error:{message}}` 信封。
4. `security.getLocalNonce()` → 返回固定值 `'inprocess'`（无服务端，nonce 机制不存在）。
5. `backup.createBackup/restoreBackup` → `throw new Error('备份恢复仅桌面版支持')`。
6. `fx.getUsdCnyRate` → 复制路由的兜底语义：用例抛错时返回 `{ rate: 7.2 }`（以路由实际兜底值为准，先读 fxRoutes.ts）。
7. `auth.onAuthStateChange(cb)` 与 `sync.onStatusChange(cb)`：进程内直接订阅——auth 走 `startAuthListener` 后的广播器回调（Task 2 的注入面，导出一个 `subscribeAuthState(cb): () => void` 供 renderer 注册）；sync 走 syncStatusNotifier 的监听注册（以该文件实际导出为准）。若同步订阅面不可行，退化为与 `browserHttpRuntimeApi` 相同的轮询实现（先读该文件 84 行、283 行的做法）。
8. `stock` 命名空间按映射表复用 asset 用例（与 browserHttpRuntimeApi 133 行的参数包装一致：`createStockAssetQuery` 等）。
9. `portfolio.getRiskMetrics` 的路由用动态 import——进程内直接静态 import 即可。
10. `settings.reset` 复用 `updateSettingsUseCase`（与路由一致）。

**端点 → 用例映射表**（完整，import 路径省略 `src/main/application/useCases/` 前缀；`authService`/服务类见备注）：

| 命名空间 | 方法 | 用例/服务 |
|---|---|---|
| auth | login / register / logout / getSession / updatePassword | `@main/infrastructure/supabase/authService` 同名方法 |
| sync | syncData | `@main/application/services/dataSyncService` 的 `syncData` |
| asset | search / getDetail / compare | searchAssets / getAssetDetail / compareAssets |
| stock | search / getDetail / compare | 同 asset（参数包装见约定 8） |
| watchlist | list / addAsset / removeAsset / listGroups / createGroup / updateGroup / deleteGroup / addToGroup / removeFromGroup / listGroupAssets / getAssetGroupIds | listWatchlist / addWatchlistAsset / removeWatchlistAsset / listWatchlistGroups / createWatchlistGroup / updateWatchlistGroup / deleteWatchlistGroup / addAssetToWatchlistGroup / removeAssetFromWatchlistGroup / listWatchlistGroupAssets / getAssetGroupIds |
| calculation | getHistoricalYield / estimateFutureYield / runDividendReinvestmentBacktest | getHistoricalYieldForAsset / estimateFutureYieldForAsset / runDividendReinvestmentBacktestForAsset（symbol→req 包装同 browserHttpRuntimeApi 193-215 行） |
| calculation | getHistoricalYieldForAsset / estimateFutureYieldForAsset / runDividendReinvestmentBacktestForAsset | 同名用例 |
| portfolio | list / upsert / remove / removeByAsset / replaceByAsset / getRiskMetrics | listPortfolioPositions / upsertPortfolioPosition / removePortfolioPosition / removePortfolioPositionsByAsset / replacePortfolioPositionsByAsset / getPortfolioRiskMetrics |
| settings | get / update / reset | getSettingsUseCase / updateSettingsUseCase / updateSettingsUseCase(reset 语义) |
| backup | createBackup / restoreBackup | 约定 5 |
| industry | getAnalysis / getDistribution / getBenchmark | getIndustryAnalysis（同名导出函数） |
| backtest | historyList / historySave / historyDelete | backtestHistoryUseCases 的三个导出（同步函数） |
| security | getLocalNonce | 约定 4 |
| fx | getUsdCnyRate | getFxRateUseCase 的 `getUsdCnyRate`（约定 6） |
| housing | listCities / getCityDetail / watchCity / unwatchCity / updateUserData / removeUserData / calculateMortgage | listHousingCities / getHousingCityDetail / toggleHousingWatchlist(watch) / toggleHousingWatchlist(unwatch) / updateHousingUserData / removeHousingUserData / calculateMortgageUseCase |
| crossAsset | getComparison | getCrossAssetComparison |
| dividend | getHistory / listUpcoming / getForecast | listDividendHistory / listUpcomingDividends / getDividendForecast |
| yieldMap | get / refresh | getMarketYieldMap / refreshMarketYieldMap |

参数/返回的具体形状以 `shared/contracts/api.ts` 的方法签名为准 + 参照 `browserHttpRuntimeApi.ts` 对应行的请求包装（两者对照转写）。

- [ ] **Step 1: 对照 `shared/contracts/api.ts` + `browserHttpRuntimeApi.ts` 逐命名空间实现**（一个 namespace 一个代码块，方法体一行直调；参数包装从 browserHttpRuntimeApi 对应方法抄改）。
- [ ] **Step 2: `desktopApi.ts` 增加分支**（在 mock 分支之前）：

```ts
if (!api && window.location.search.includes('runtime=inprocess')) {
  return inprocessRuntimeApi
}
```

- [ ] **Step 3: 验证** — `npm run typecheck`（类型完整性强制）+ `npm test` 全量 + 目检（见 Task 6）。
- [ ] **Step 4: Commit** — `feat(renderer): inprocess 运行时直连用例，?runtime=inprocess 启用`

---

### Task 6: 端到端目检 + 全量回归 + 合并

- [ ] **Step 1: 目检**（`npm run dev:browser-preview`，需 `.env` 有真实 SUPABASE 凭据且网络可达）：打开 `http://127.0.0.1:8192/?runtime=inprocess`——登录 → 自选增删 → 持仓录入 → 分红历史 → 房产城市详情；DevTools Console 无 electron/node 垫片错误；Network 面板确认无 `/api` 轮询（进程内直调）。
- [ ] **Step 2: 桌面回归** — `npm run dev` 启动 Electron 桌面版：登录态、自选、持仓、DB 读写与改动前一致。
- [ ] **Step 3: 全量** — `npm run typecheck && npm test`（436+ 全绿）。
- [ ] **Step 4: 合并** — `git checkout main && git merge --no-ff feat/p1-inprocess-runtime -m "merge: feat/p1-inprocess-runtime 合并回 main（P1 进程内运行时）" && git push origin main`。
- [ ] **Step 5: 文档** — 更新 `docs/README.md` 索引与 `docs/ANDROID-PORT-ASSESSMENT.md` P1 行状态（完成后按 docs §3 边界移除本计划文件）。

---

## Self-Review 记录

- **Spec 覆盖**：评估 §4.1（第四运行时）→ Task 5；§4.3（驱动抽象）→ Task 1（resolver 缝；完整驱动接口按评估口径留待 P2 异步决策）；§2.2/2.3 的三条 electron 链 → Task 1/2/3；§6 P1 验收标准（浏览器预览 inprocess 下自选/持仓读写全通、npm test 全绿）→ Task 6。
- **占位符扫描**：Task 1/3/4/5 含完整代码或确定性映射表；Task 2 的"先读后写"是显式步骤（syncStatusNotifier 内部形态是计划输入而非 TBD）；约定 7/6 标注了两处需以现状文件为准的退化路径。
- **类型一致性**：`setDatabaseResolver/resetDatabaseResolver`（Task 1 定义，Task 1 测试消费）；`installElectronSqliteProvider/installElectronBroadcasters`（Task 1/2 产出，index.ts 接线）；`inprocessRuntimeApi`（Task 5 产出，desktopApi 消费）。
- **风险预案**：若 Task 5 目检发现某用例在浏览器抛 node 垫片错误（未识别的链），处理约定：定位该链 → 按三缝同模式收敛 → 并入本计划修复轮，不扩计划范围。
