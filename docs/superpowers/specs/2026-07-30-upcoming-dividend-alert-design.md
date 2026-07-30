# 即将到账分红提示 — 设计文档

- 日期：2026-07-30
- 作者：Alex（由 brainstorming skill 协助起草）
- 状态：草案，待评审

## 1. 背景与目标

当前 `DividendCenterPage`（分红统计中心）只统计**已除权除息已实施**的历史分红，看不到"已公告但未派发"的预案分红，也没有"当年预计还能拿多少分红"的预览。

目标：在分红统计页加 "即将到账分红" 信息区：

1. **待入账列表**：展示每只持仓资产已公告、未除权除息的分红预案（每股、派息日预告、按当前持仓估算金额）
2. **当年预期分红总额**：以全年估算为锚，拆解为「已到账 / 待入账 / 剩余估算」三项并列展示

非目标：
- 不新增独立页面，只在 `DividendCenterPage` 内嵌入新区块
- 不做 email/系统通知，不接入交易日历提醒
- 不重构现有 `listDividendHistory` 已实施口径

## 2. 口径（Alex 已确认）

| 项 | 计算方式 | 数据来源 |
|---|---|---|
| **全年估算总额** | Σ 持仓_i × `futureYieldEstimator(资产_i).estimatedDividendPerShare` | 复用 `src/main/domain/services/futureYieldEstimator.ts` |
| **已到账** | 当年 `dividendPerShare × heldShares`，仅含已实施 | 现有 `listDividendHistory` 输出 |
| **待入账** | Σ 已公告未实施分红_i × 持仓_i | 新功能 |
| **剩余估算** | `max(全年估算总额 − 已到账 − 待入账, 0)`，纯展示派生值 | useCase 内计算后通过 DTO 返回，前端不重复算术 |

> 剩余估算是「差额」概念，不参与任何 domain 计算；仅当为负时夹 `0`。

## 3. 数据源策略（已确认：扩展实体 + 落库）

### 3.1 实体层扩展

`src/main/domain/entities/Stock.ts` 的 `DividendEvent` 增加字段：

```ts
export type DividendEvent = {
  // ...原有字段
  status: 'IMPLEMENTED' | 'PLANNED' | 'IN_PROGRESS'  // 新增
  announcementProgress?: string   // 新增 — 原始 ASSIGN_PROGRESS 文本，便于前端展示「董事会预案/股东大会通过」等明细
}
```

- `IMPLEMENTED`：原文 `ASSIGN_PROGRESS` 含「实施」
- `PLANNED`：原文含「预案」
- `IN_PROGRESS`：原文含「股东大会通过」「董事会通过」「批准」等中间状态

### 3.2 Repository schema 调整

`src/main/repositories/dividendRepository.ts` 的 `dividend_events` 表：

```sql
-- 一次性迁移（通过 apply_migration 执行）
ALTER TABLE dividend_events ADD COLUMN status TEXT;          -- 非空，迁移时对存量行填 'IMPLEMENTED'
ALTER TABLE dividend_events ADD COLUMN announcement_progress TEXT;

-- 唯一键调整：原 (asset_key, ex_date) 无法容纳预案（ex_date=null）
-- 改为 (asset_key, announce_date, fiscal_year) 复合键 + status 字段
-- 允许 ex_date 为 null
-- 用 SQLITESchemaVersion 机制建立新版本 schema
```

唯一键变更细节：
- 旧键 `(asset_key, ex_date)` → 新键 `(asset_key, announce_date, fiscal_year)`
- `announce_date` 可能为 null（极少见），此情况用 `coalesce(announce_date, '1970-01-01')` 处理兜底
- `ex_date` 不再是主键一部分，仅保留为索引列；原已实施数据保留不变

### 3.3 适配器层调整

`src/main/adapters/eastmoney/eastmoneyAShareDataSource.ts:270-271`：

```ts
// 旧： 仅保留已实施
.filter((record) => (record.ASSIGN_PROGRESS ?? '').includes('实施'))

// 新： 保留全部，并映射 status
.map((record) => ({
  ...原有字段,
  status: mapAssignProgressToStatus(record.ASSIGN_PROGRESS),
  announcementProgress: record.ASSIGN_PROGRESS ?? null,
}))
```

新增映射函数 `mapAssignProgressToStatus(raw: string): DividendEvent['status']`：
- 含「实施」 → `IMPLEMENTED`
- 含「预案」 → `PLANNED`
- 否则 → `IN_PROGRESS`

基金股 `parseFundDividendEvents` 同步加 `status` 字段（基金接口原始数据多为已实施文本，`PLANNED`/`IN_PROGRESS` 通常为空，但字段必须加，保证类型完整）。

### 3.4 ETF 数据源处理

ETF 当前 `eastmoneyEtfDataSource` 暂未实现 `asset.dividend` capability（调研未确认其存在，实施时需补探）。若也存在类似过滤，同样去掉；若无，则跳过。

## 4. 用例层

新增两个用例（位于 `src/main/application/useCases/`）：

### 4.1 `listUpcomingDividends`

```ts
// 输入：无（基于当前持仓自动检索）
// 输出：UpcomingDividendDto[]
type UpcomingDividendDto = {
  assetKey: string
  assetType: 'STOCK' | 'ETF' | 'FUND'
  code: string
  name: string
  heldShares: number          // 当前净持仓（复用 listDividendHistory 的聚合逻辑）
  announceDate?: string
  expectedExDate?: string     // 预案通常 exDate=null，可能有计划日期
  expectedPayDate?: string
  dividendPerShare: number
  announcementProgress: string  // 「董事会预案」等
  status: DividendEvent['status']
  estimatedAmount: number      // = dividendPerShare × heldShares
}
```

实现步骤：
1. 调 `PortfolioRepository` 拿持仓（同 `listDividendHistory` 的聚合方式）
2. 对每个持仓 assetKey，调 `DividendRepository.listByAsset` 完整列表中过滤 `status != 'IMPLEMENTED'` 且 `year === currentYear`
3. **若库内无预案数据**，触发 `DividendRepository.refreshFromSource` —— 拉最新接口数据填库后重试（解决"预案昨日刚出，本地库还没刷新"场景）
4. 组装为 `UpcomingDividendDto[]` 输出

> **刷新策略**：MVP 阶段无 TTL 缓存。用户每次进入分红统计页，`listUpcomingDividends` 都会先检查库内是否有当年非实施记录，无则触发一次外部接口拉取填库。后续优化可在 §11 第 2 条加入 TTL 控制避免重复抓取。

### 4.2 `getDividendForecast`

```ts
// 输入：year?: number (默认当前年)
// 输出：DividendForecastDto
type DividendForecastDto = {
  year: number
  annualEstimatedTotal: number        // 全年估算总额
  yearToDateActual: number             // 已到账
  upcomingPlanned: number               // 待入账（= Σ UpcomingDividendDto.estimatedAmount）
  remainingEstimated: number           // max(annualEstimated - ytd - upcoming, 0)
  details: {
    upcoming: UpcomingDividendDto[]
    // yearlyTotal、ytd 等可复用 listDividendHistory 的输出，不重复列出
  }
}
```

实现步骤：
1. 调 `futureYieldEstimator.estimateFutureYield` / `estimateFundFutureYield` 对每个持仓资产算 `estimatedDividendPerShare`（baseline 口径）—— 用 baseline 不用 conservative，与前端展示风格一致
2. 调 `listUpcomingDividends` 拿待入账明细
3. 调 `listDividendHistory` 拿已到账汇总
4. 三项聚合，`remainingEstimated = max(annualEstimated - ytd - upcoming, 0)` 在用例内算好（前端不做算术，保持主从一致）

## 5. 契约层（`shared/contracts/api.ts`）

新增命名空间 `DividendMonitorApi.dividend`：

```ts
interface DividendMonitorApi {
  // 现有 stock / asset / portfolio 等...
  dividend: {
    // 现有 — 需迁移进来
    getHistory(req: DividendHistoryRequest): Promise<DividendHistoryResponse>
    // 新增
    listUpcoming(req: ListUpcomingDividendsRequest): Promise<ListUpcomingDividendsResponse>
    getForecast(req: GetDividendForecastRequest): Promise<GetDividendForecastResponse>
  }
}
```

> **附带改进（建议同步做）**：现有 `dividendApi.ts`（renderer service）未走 `desktopApi` runtime 分发，直连 HTTP。新功能加入时一并对齐——把 `getHistory` 也统一到 `getDividendDesktopApi()`。这样桌面/浏览器预览 mock 三种 runtime 才能透明切换，符合项目双运行时设计约束。

## 6. IPC / HTTP 通道

| 通道 | Electron IPC | HTTP 路由 | 浏览器预览 mock |
|---|---|---|---|
| 新增 `dividend:upcoming` | `src/main/ipc/channels/dividendChannels.ts` 追加注册 | `POST /api/dividend/upcoming` 同文件 `src/main/http/routes/dividendRoutes.ts` | `browserRuntimeApi.dividend.listUpcoming` 返回 Mocker fixture |
| 新增 `dividend:forecast` | 同上 | 同上 | 同上 |
| 既有 `dividend:history` | 保持 | 保持 | 迁入 runtime 分发 |

## 7. 渲染层

### 7.1 渲染 service 迁移

`src/renderer/src/services/dividendApi.ts` 重写为标准模式：

```ts
import { getDividendDesktopApi } from '@renderer/services/desktopApi'
export const dividendApi = {
  getHistory(req) { return getDividendDesktopApi().getHistory(req) },
  listUpcoming(req) { return getDividendDesktopApi().listUpcoming(req) },
  getForecast(req) { return getDividendDesktopApi().getForecast(req) }
}
```

`desktopApi.ts` 新增 `getDividendDesktopApi()`，`browserHttpRuntimeApi` / `browserRuntimeApi` 补 `dividend` 命名空间字段。

### 7.2 页面改造

`DividendCenterPage.tsx` 顶部汇总区在 4 张原卡片之后，新增一行 **3 张预期卡片**：

```
[ 全年估算总额 ]   [ 待入账（N笔） ]   [ 剩余估算 ]
```

- 「全年估算总额」：`forecast.annualEstimatedTotal`
- 「待入账」：`forecast.upcomingPlanned` + 副标题 `forecast.details.upcoming.length 笔`
- 「剩余估算」：`forecast.remainingEstimated`，附灰色小字"全年估算 − 已到账 − 待入账"

页面中部，在「分红明细表」和「个股分红排行」之间新增 **「即将到账」** 区块（折叠 `Collapse` 面板，默认展开）：

```
即将到账（已公告未除权除息）
┌──────────┬──────┬──────┬──────────┬─────────────┬─────────────┬──────────────┐
│ 标的      │ 代码 │ 持仓 │ 预案公告日 │ 计划除权日   │ 每10股送转   │ 估算金额（元） │
│ 贵州茅台  │...   │...   │ 2026-07-15│ 待定         │ 0            │  ¥2,500.00   │
└──────────┴──────┴──────┴──────────┴─────────────┴─────────────┴──────────────┘
```

列定义：
- 「方案进度」列额外显示 `announcementProgress` 文本，Tag 颜色按 `status`：`PLANNED=blue`、`IN_PROGRESS=gold`、`IMPLEMENTED=green`
- 「每10股送转」复用现有列实现
- 「估算金额」= `dividendPerShare × heldShares`

空状态：无即将到账时显示"当前无已公告未派发的分红预案"。

### 7.3 错误处理

- 直接复用现有 `useEffect` 内 `error` 链路：拉取失败显示 Antd `Result` 错误卡
- 新接口 `/upcoming` 与 `/forecast` 任一失败时，旧 `getHistory` 区块独立可用
- 数据源离线时（mock runtime），fixture 返回空 `upcoming: []` 与 `annualEstimatedTotal: 0`，保证页面不崩

## 8. 测试策略

### 8.1 单元测试（domain / adapter / repo）

- `mapAssignProgressToStatus` 纯函数：覆盖「实施/预案/股东大会通过/董事会通过/批准/空字符串」等样本
- `dividendRepository`：`UPSERT` 新唯一键行为 + 存量迁移后旧数据 `status = 'IMPLEMENTED'` 一致
- `eastmoneyAShareDataSource.getDividendRecords`：对含预案+实施混合响应的 fixture，断言两个状态都保留
- `listUpcomingDividends` / `getDividendForecast` useCase：fixture 化 `DividendRepository` + `PortfolioRepository` + `futureYieldEstimator` 三种返回，分别验证汇总数字与剩余估算 clamp 行为

### 8.2 集成测试

- HTTP 路由 `POST /api/dividend/upcoming`、`POST /api/dividend/forecast`：通过 supertest 或直接 invoke Electron 端
- 端到端：mock 桌面模式 `dividend.listUpcoming()` 返回 fixture，验证 `dividendApi.listUpcoming()` 通过

### 8.3 现有回归

- `listDividendHistory` 输出不变（已实施口径维持原样）
- `eastmoneyAshareAdapter` 复权逻辑 `applyCorporateActionsToPositions` 仍能正确识别已实施分红（断言 `status === 'IMPLEMENTED'` 而不是「全部」）

## 9. 风险与权衡

| 风险 | 说明 | 处理 |
|---|---|---|
| 旧唯一键迁移 | 已实施数据 `status` 列 NULL 会破坏过滤 | 迁移时统一 `UPDATE dividend_events SET status = 'IMPLEMENTED' WHERE status IS NULL` |
| 重复拉接口 | `listUpcomingDividends` 每次 refresh 库 | 加 12 小时 TTL（MVP 可推迟） |
| futureYieldEstimator 对某资产返回 undefined | 例如新股无历史分红 | 该资产视为 `annual = 0`，不参与全年估算 |
| 剩余估算为负 | 估算偏差，已到账+待入账超过全年估算 | 用 `max(0, ...)` clamp，前端不显示负数 |
| ETF dividend capability 未实现 | 调研未验证，可能在 MVP 里 ETF 拿不到分红数据 | 实施前先跑调研确认，若缺则按现有行为做降级（ETF 显示"暂不支持"而非崩溃） |
| 渲染层 dividendApi 迁移 | 现有直连 HTTP 行为与 mock 不兼容 | 设计 §5 已要求统一，但需确保 mock 实现与之对齐 |

## 10. 分阶段交付计划（草拟）

1. **第 1 阶段**：domain + adapter + repo schema 扩展，支持 status 字段落库与读出
2. **第 2 阶段**：useCase + 渠道 + DTO 契约（`listUpcomingDividends`、`getDividendForecast`）+ runtime 分发对齐
3. **第 3 阶段**：renderer service 迁移 + `DividendCenterPage` 顶部卡片与「即将到账」表
4. **第 4 阶段**：测试补齐与回归

每个阶段可独立提交、独立功能可见。

## 11. 留待 implementation plan 进一步细化的事项

- ETF `asset.dividend` capability 现状核实（必要时降级处理）
- TTL 缓存层是否 MVP 就做
- 持仓 `heldShares` 重用 `listDividendHistory` 内的聚合逻辑，是抽公共 utility 还是各自调用（DRY）
- 数据库 schema 版本管理机制现状复核