# DividendMonitor 交接文档

> 生成时间：2026-07-25
> 状态：原 HANDOFF 中 3 个问题已全部完成，另有后续优化若干

## 1. 项目环境速查

| 项 | 值 |
|----|----|
| 项目根 | `I:\code\DividendMonitor` |
| 桌面运行 | `npm run dev` |
| 浏览器预览 | `npm run dev:browser-preview`（DIVIDEND_MONITOR_HEADLESS=1） |
| HTTP API | `http://127.0.0.1:3210` |
| 前端 dev server | `http://127.0.0.1:8192/?runtime=http` |
| 数据库（dev） | `I:\code\DividendMonitor\.runtime-data\db\dividend-monitor.sqlite` |
| 数据库（安装版） | `%APPDATA%\shou-xi-lao\db\dividend-monitor.sqlite` |
| TypeCheck | `npx tsc --noEmit` |
| 测试 | `npx vitest run`（212 个测试） |
| Supabase | `https://vdczexwurzzrlmmtybau.supabase.co` |
| 路径别名 | `@main @preload @renderer @shared`（详见 AGENTS.md） |

> **重要坑**：dev 模式下 SQLite 在 `.runtime-data/` 目录，不是 `%APPDATA%\shou-xi-lao\`。

## 2. 已完成的工作（本次会话）

### 2.1 问题 1：除权除息算法切换为因子法

**改动文件**：
- `src/main/application/useCases/applyCorporateActionsToPositions.ts` — 核心算法从 `avgCost - cash`（简单减法）改为 `avgCost * computeEventFactor(event)`（因子法）
- `src/main/infrastructure/db/migrations/corporateActionsCursorResetMigration.ts` — 一次性迁移：逆序还原旧算法的扣减（加回 cash、反转股数），然后重置游标为 NULL，让新算法重新应用
- `src/main/infrastructure/db/sqlite.ts` — 注册迁移

**算法说明**：
```
factor = (referenceClosePrice - dividendPerShare) / (referenceClosePrice × (1 + bonusRatio))
newAvgCost = oldAvgCost × factor
```
- 红利税在卖出时才扣，除权除息调整成本时不涉及红利税
- 若 referenceClosePrice 为 0（数据缺失），fallback 到旧逻辑

### 2.2 问题 2：多笔持仓展开行编辑

**改动文件**：
- `src/renderer/src/components/dashboard/PortfolioTable.tsx` — Ant Design Table expandable，展开显示每笔交易明细（方向、股数、成交价、买入日期、编辑/删除按钮）
- `src/renderer/src/hooks/usePortfolio.ts` — 新增 `PortfolioTransaction` 类型，聚合时保留每笔独立记录
- `src/renderer/src/pages/DashboardPage.tsx` — 新增 `onEditTransaction(record, transaction)` 和 `onRemoveTransaction(record, transaction)`

### 2.3 问题 3：分红统计中心页面

**改动文件**：
- `src/main/application/useCases/listDividendHistory.ts` — 新 use case，只统计 exDate >= openedAt 的事件
- `src/main/repositories/dividendRepository.ts` — 新增 `listAll(options?)` 方法
- `src/main/ipc/channels/dividendChannels.ts` — 新 IPC channel `dividend:history`
- `src/main/http/routes/dividendRoutes.ts` — 新 HTTP route `POST/GET /api/dividend/history`
- `src/main/http/server.ts` — 注册路由
- `src/main/ipc/channels/index.ts` — 注册 channel
- `src/renderer/src/services/dividendApi.ts` — 前端 API 服务
- `src/renderer/src/pages/DividendCenterPage.tsx` — 新页面（ECharts 柱状/折线图 + 汇总面板 + 表格）
- `src/renderer/src/router/AppRouter.tsx` — 路由 `/dividend-center`
- `src/renderer/src/layouts/AppShell.tsx` — 导航项"分红统计"

**UI 风格**：使用项目设计令牌（#0052d0 主色、glass-card、ledger-metric-panel、soft-table、danger #b31b25、text-soft #66707a）

### 2.4 买入佣金自动计算（可配置）

**需求**：佣金 = max(成交额 × 费率, 最低佣金)，默认万分之一、最低 5 元（不免五）

**改动文件**：
- `src/main/domain/entities/Settings.ts` — 新增 `buyCommissionRate`（默认 0.0001）和 `buyMinCommission`（默认 5）
- `shared/contracts/api.ts` — SettingsDto 加字段
- `src/main/repositories/settingsRepository.ts` — getAllSettings 加字段读取
- `src/renderer/src/services/browserRuntimeApi.ts` — defaultMockSettings 加字段
- `src/renderer/src/pages/SettingsPage.tsx` — 通用 tab 新增"买入佣金"配置区块
- `src/renderer/src/components/dashboard/PortfolioPositionEditorModal.tsx` — 通过 `useSettings()` 读取费率，实时显示佣金和实际成本价

### 2.5 数据模型分离：tradePrice vs avgCost

**需求**：明细行显示原始成交价（ immutable），总行显示含佣金+除权除息的综合成本价

**改动文件**：
- `src/main/infrastructure/db/sqlite.ts` — 新增 `migratePortfolioTradePriceColumn` 迁移（ALTER TABLE ADD COLUMN trade_price REAL）
- `shared/contracts/api.ts` — PortfolioPositionDto 和 PortfolioPositionUpsertDto 加 `tradePrice?: number`
- `src/main/repositories/portfolioRepository.ts` — Row 类型、toDto、SELECT、INSERT/UPDATE 均加 trade_price
- `src/main/repositories/supabasePortfolioRepository.ts` — list() 映射和 upsert() payload 加 trade_price
- `src/renderer/src/services/portfolioStore.ts` — PortfolioPosition 类型、normalizePosition、fromDto、toBackendRequest、upsertPortfolioPositionInBackend 均加 tradePrice
- `src/renderer/src/hooks/usePortfolio.ts` — PortfolioTransaction 加 tradePrice
- `src/renderer/src/components/dashboard/PortfolioTable.tsx` — 明细行显示 `tx.tradePrice ?? tx.avgCost`，表头改为"成交价"
- `src/renderer/src/pages/DashboardPage.tsx` — onSubmitEditor 传 tradePrice，onEditTransaction 用 tradePrice 作为编辑器初始值
- `src/renderer/src/components/dashboard/PortfolioPositionEditorModal.tsx` — PortfolioEditorSubmitValues 加 tradePrice，提交时 tradePrice = 用户输入的原始价格，avgCost = 含佣金的真实成本
- 测试文件：`portfolioRepository.upsert.test.ts`、`supabasePortfolioRepository.upsert.test.ts` — CREATE TABLE 加 trade_price 列

### 2.6 显示精度统一为三位小数

- `PortfolioTable.tsx` 的 currency formatter：`minimumFractionDigits: 3, maximumFractionDigits: 3`
- 编辑模态佣金显示：`trueCost.toFixed(3)`

## 3. 待用户操作

> 2026-08-03 已全部结清：3.1 云端已加列、3.2 交行成交价已重录并验证通过、3.3 三只持仓已不在本地与云端。

### 3.1 Supabase 云端加列（必须）✅ 已完成

用户需在 Supabase Dashboard → SQL Editor 执行：

```sql
ALTER TABLE portfolio_positions ADD COLUMN trade_price REAL;
```

本地 SQLite 不用管，启动时自动迁移。

### 3.2 重新录入交行成交价 ✅ 已完成（2026-08-03 验证通过）

> 具体成交价、买入日期与成本数值已脱敏。

交行三笔此前 avg_cost 为旧算法算出的错误值，用户通过编辑功能重新输入原始成交价，系统自动计算佣金与含佣金成本价，并经除权除息因子调整。

**验证结果**：本地与云端均已存正确成交价与买入日期；除权调整后总行加权平均成本与期望验收值一致。✅

### 3.3 数据污染（历史遗留）✅ 已结清（2026-08-03 核实）

> 具体标的信息已脱敏。

此前 3 只持仓 avg_cost 为 0 需修正，现本地与云端均已不存在该问题。

## 4. 关键架构说明

### 4.1 成本价数据流

```
用户输入成交价(tradePrice)
  → 编辑模态计算佣金: commission = max(tradePrice × shares × rate, minCommission)
  → 计算含佣金成本: avgCost = (tradePrice × shares + commission) / shares
  → 提交 { tradePrice, avgCost } 到后端
  → 后端存入 portfolio_positions (trade_price 列 + avg_cost 列)
  → 除权除息只修改 avg_cost: avgCost *= factor
  → 前端明细行显示 tradePrice（原始成交价，永不变）
  → 前端总行显示加权平均 avgCost（含佣金+除权调整）
```

### 4.2 设置系统

新增设置字段需改 6 处：
1. `src/main/domain/entities/Settings.ts`（entity + DEFAULT_SETTINGS）
2. `shared/contracts/api.ts`（SettingsDto）
3. `src/main/repositories/settingsRepository.ts`（getAllSettings 读取）
4. `src/renderer/src/services/browserRuntimeApi.ts`（defaultMockSettings）
5. `src/renderer/src/pages/SettingsPage.tsx`（UI）
6. 消费组件用 `useSettings()` hook 读取

### 4.3 除权除息算法

```typescript
// src/main/domain/services/adjustmentFactorService.ts
factor = (referenceClosePrice - dividendPerShare) / (referenceClosePrice × (1 + bonusRatio))

// src/main/application/useCases/applyCorporateActionsToPositions.ts
newAvgCost = avgCost × factor  // 有 referenceClosePrice 时
newShares = shares × (1 + bonusRatio)
```

- 游标 `corporate_actions_applied_until` 跟踪已应用事件
- 编辑 avgCost 或 openedAt 时游标重置为 NULL（ON CONFLICT CASE WHEN）
- 只应用 exDate >= openedAt 的事件

### 4.4 分红统计

- 只统计 exDate >= 各资产 openedAt 的事件
- 没有 openedAt 的持仓不参与统计
- 后端：`listDividendHistory` use case
- 前端：`/dividend-center` 路由

## 5. 关键代码位置索引

| 功能 | 文件 |
|------|------|
| 持仓 CRUD（本地） | `src/main/repositories/portfolioRepository.ts` |
| 持仓 CRUD（云端） | `src/main/repositories/supabasePortfolioRepository.ts` |
| 除权除息算法 | `src/main/application/useCases/applyCorporateActionsToPositions.ts` |
| 复权因子 | `src/main/domain/services/adjustmentFactorService.ts` |
| 游标重置迁移 | `src/main/infrastructure/db/migrations/corporateActionsCursorResetMigration.ts` |
| trade_price 迁移 | `src/main/infrastructure/db/sqlite.ts` → `migratePortfolioTradePriceColumn` |
| 设置 entity | `src/main/domain/entities/Settings.ts` |
| 设置页面 | `src/renderer/src/pages/SettingsPage.tsx` |
| 编辑模态 | `src/renderer/src/components/dashboard/PortfolioPositionEditorModal.tsx` |
| 持仓表格 | `src/renderer/src/components/dashboard/PortfolioTable.tsx` |
| 持仓聚合 hook | `src/renderer/src/hooks/usePortfolio.ts` |
| Dashboard 页 | `src/renderer/src/pages/DashboardPage.tsx` |
| 分红统计页 | `src/renderer/src/pages/DividendCenterPage.tsx` |
| 分红统计 use case | `src/main/application/useCases/listDividendHistory.ts` |
| DB schema + 迁移 | `src/main/infrastructure/db/sqlite.ts` |
| 共享 DTO | `shared/contracts/api.ts` |

## 6. 用户偏好（重要）

- 所有成本价/数字显示必须精确到小数点后三位
- 不要为计算错误找借口，直接承认并修正
- 红利税在卖出时才扣，除权除息调整成本时不涉及红利税
- 佣金费率必须可配置（在设置页），不能写死
- 明细行存原始成交价，不要和佣金/除权后的价格搞混
- UI 风格：#0052d0 主色、glass-card、ledger-metric-panel、soft-table

## 7. 验收要点

1. `npx tsc --noEmit` 零错误
2. `npx vitest run` 212 个测试全过
3. 启动后持仓页：明细行显示"成交价"（原始），总行显示"成本价"（含佣金+除权）
4. 编辑模态：输入成交价后实时显示佣金和实际成本价
5. 设置页通用 tab：可配置佣金费率和最低佣金
6. 分红统计页：只统计 openedAt 之后的事件，UI 风格统一
7. Supabase 执行 `ALTER TABLE portfolio_positions ADD COLUMN trade_price REAL;` 后云端同步正常

## 8. 环境注意事项

- Grep 工具在该环境不可用（rg.exe ENOENT），用 Read + Agent(Explore) 替代搜索
- Bash 需要用 `dir_path` 参数指定工作目录，不能 `cd I:\...`
- 测试文件里如果有 CREATE TABLE，新增列后必须同步更新测试的建表语句
