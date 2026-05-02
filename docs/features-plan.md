# 功能规划文档：设置页面 / 股息率地图 / 行业板块分析 / 回测增强

## 文档信息

- 创建日期：2026-04-30
- 最后更新：2026-05-01
- 状态：跟踪实现进度，已完成项标注为 ✅

---

## 一、总览

| 优先级 | 功能 | 状态 | 实现与规划的差异 |
|--------|------|------|------------------|
| P0 | 设置页面 | ✅ 已实现 | 规划用 Tabs 分组，实际按 Tab 切换；增加了默认年份范围选择器 |
| P0 | 回测增强 | ✅ 已实现 | 未新建 `getBenchmarkPriceHistory` use case，基准 K 线直接在用例内获取 |
| P1 | 行业/板块分析 | ✅ 已实现 | `IndustryDistributionPie` 被提取为共享组件；Dashboard 也已使用；未单独建 `IndustryList`/`IndustryDetailDrawer` |
| P1 | 股息率地图 | ❌ 未实现 | 仍为规划状态 |

---

## 二、设置页面 ✅

### 2.1 已实现

| 文件 | 说明 |
|------|------|
| `src/renderer/src/pages/SettingsPage.tsx` | 设置页面，含"通用"/"回测"两个标签页 |
| `src/main/repositories/settingsRepository.ts` | `app_settings` 表 CRUD（key-value 模型） |
| `src/main/application/useCases/getSettingsUseCase.ts` | 读取全部设置 |
| `src/main/application/useCases/updateSettingsUseCase.ts` | 更新设置（partial） |
| `src/main/ipc/channels/settingsChannels.ts` | `settings:get` / `settings:update` / `settings:reset` |
| `src/main/http/routes/settingsRoutes.ts` | `GET/PUT /api/settings` |
| `src/renderer/src/hooks/useSettings.ts` | 前端设置读写 hook |
| `shared/contracts/api.ts` | `SettingsDto` 类型定义 |

### 2.2 已实现的设置项

| 分组 | 设置项 | 类型 |
|------|--------|------|
| 通用 | 默认年份范围 | 双下拉选择器（起/止年） |
| 通用 | 默认排序指标 | 下拉选择 |
| 回测 | 默认初始资金 | 数字输入 |
| 回测 | 是否计入手续费 | 开关 |
| 回测 | 手续费率 | 数字输入 |
| 回测 | 印花税率 | 数字输入 |
| 回测 | 最低佣金 | 数字输入 |

### 2.3 与规划的差异

- 规划中"数据刷新策略"未实现
- 规划中"通知/提醒"未实现
- 设置兼容离线/在线模式（在线模式自动走 Supabase 同步）

---

## 三、股息率地图 ❌

### 3.1 状态

未实现。PRD §8.2 仍标注为"预留"。当前无任何相关代码。

### 3.2 规划要点（供后续参考）

- 首期选 Treemap（ECharts），按行业分组展示股息率分布
- 数据源需全市场 A 股行业分类 + 估值数据的批量抓取
- 需要 Supabase `industry_yield_snapshots` 表做云端聚合缓存
- 路由 `/yield-map`，`YieldMapPage` + `YieldMapTreemap` 组件

---

## 四、行业/板块分析 ✅

### 4.1 已实现

| 文件 | 说明 |
|------|------|
| `src/main/application/useCases/getIndustryAnalysis.ts` | 行业聚合分析 + 行业分布统计 + 行业基准查询 |
| `src/main/domain/services/industryAnalysisService.ts`（计算逻辑在 useCase 内联） | 行业聚合计算 |
| `src/main/ipc/channels/industryChannels.ts` | `industry:analysis` / `industry:distribution` / `industry:benchmark` |
| `src/main/http/routes/industryRoutes.ts` | `POST /api/industry/analysis` / `GET /api/industry/distribution` / `POST /api/industry/benchmark` |
| `src/renderer/src/pages/IndustryAnalysisPage.tsx` | 行业分析页（分布饼图 + 行业汇总表 + 个股明细） |
| `src/renderer/src/components/industry/IndustryDistributionPie.tsx` | 共享饼图组件（Dashboard 和行业分析页共用） |
| `src/renderer/src/hooks/useIndustryAnalysis.ts` | `useIndustryAnalysis` + `useIndustryBenchmark` |

### 4.2 已实现的交互

- **Dashboard**：持仓行业分布饼图（`IndustryDistributionPie`），无持仓时隐藏
- **行业分析页**：饼图 + 行业汇总表（平均股息率/PE/ROE/股票数），点击展开个股明细
- **股票详情页**：PE/ROE 估值卡片显示行业均值参考基准（`useIndustryBenchmark` hook）
- **对比表**：新增"行业"列
- **行业基准**：`getIndustryBenchmark(industryName)` 返回行业均值（avgDividendYield/avgPeRatio/avgRoe/stockCount）

### 4.3 与规划的差异

- 规划建议在 `eastmoneyAShareDataSource` 追加 `f100` 行业字段；实际实现中行业数据直接从 `Stock` 实体的现有 `industry` 字段读取（数据源已有该字段）
- 规划了 `IndustryList` + `IndustryDetailDrawer` 组件，实际未单独创建——`IndustryAnalysisPage` 内联了表格和明细展开
- 行业分布的性能优化：`getIndustryDistribution()` 使用 BATCH_SIZE=5 的并发 `Promise.allSettled`，通过 `skipCache` 参数跳过缓存以确保数据新鲜
- 规划了 `industry:list` IPC 通道，实际实现为 `industry:analysis` / `industry:distribution` / `industry:benchmark`

---

## 五、回测增强 ✅

### 5.1 已实现

| 规划项 | 状态 | 实现文件 |
|--------|------|---------|
| A. 交易成本建模 | ✅ | `dividendReinvestmentBacktestService.ts`：`feeRate`/`stampDutyRate`/`minCommission` |
| B. 定投模式 DCA | ✅ | `DcaConfig` 参数：`enabled`/`frequency`/`amount`；回测循环处理定投买入 |
| C. 基准指数对比 | ✅ | `benchmarkSymbol`/`benchmarkReturn`/`benchmarkAnnualizedReturn` |
| D. 多股票回测对比 | ✅ | `BacktestPage` 支持 `symbols` URL 参数；`BacktestMultiCompare` 对比表 |
| E. 回测结果保存 | ✅ | `BacktestHistoryPage` + `backtestResultRepository` + `backtest:history-*` 通道 |
| F. 最大回撤 | ✅ | 域服务跟踪峰谷跌幅，`BacktestSummaryCard` 展示 |

### 5.2 已实现文件清单

```
领域层：
  src/main/domain/services/dividendReinvestmentBacktestService.ts  # 最大回撤/手续费/定投/基准
  src/main/domain/entities/BacktestTransaction.ts                   # 交易记录含 fee/cost 字段

用例层：
  src/main/application/useCases/runDividendReinvestmentBacktestForAsset.ts
  src/main/application/useCases/backtestHistoryUseCases.ts         # list/save/delete

数据层：
  src/main/repositories/backtestResultRepository.ts                # backtest_results 表 CRUD

IPC/HTTP：
  src/main/ipc/channels/calculationChannels.ts                     # backtest:history-* 通道
  src/main/http/routes/calculationRoutes.ts                        # /api/backtest/history

前端：
  src/renderer/src/pages/BacktestPage.tsx                          # 多股/保存/历史入口
  src/renderer/src/pages/BacktestHistoryPage.tsx                   # 回测历史（查看/删除）
  src/renderer/src/components/backtest/BacktestSummaryCard.tsx     # 新增最大回撤卡片
  src/renderer/src/components/backtest/BacktestMultiCompare.tsx    # 多股对比表格
  src/renderer/src/components/backtest/BacktestNavChart.tsx        # 净值曲线（不再依赖基准）
```

### 5.3 与规划的差异

- 规划了独立的 `getBenchmarkPriceHistory` use case 和 `benchmark:price-history` IPC 通道；实际实现中基准 K 线在 `runDividendReinvestmentBacktestForAsset` 内部获取，未暴露独立通道
- 规划了 `BacktestNavChart` 作为"双线净值曲线"显示基准对比，实际 `BacktestNavChart` 始终渲染（不再依赖 `benchmarkReturn != null`）
- 规划了 `BacktestInput` 增加费用字段——已实现，但 `calcShares` 函数签名从 5 参数扩展为 6 参数（新增 `allowPartialBuy`）
- 股息复投逻辑从"单次派息独立复投"改为"累积现金池复投"——这是一个回测行为变更，需要用户知晓
- `syncAllLocalCacheToSupabase` 批量同步触发已移除，改为 `savePriceHistory` 内逐条异步推送至 Supabase

---

## 六、实施进度总结

```
✅ 第 1 批（已完成）
├── ✅ 设置页面
├── ✅ 回测增强 A（交易成本）
├── ✅ 回测增强 B（定投模式）
├── ✅ 回测增强 C（基准对比）
├── ✅ 回测增强 D（多股票对比）
├── ✅ 回测增强 E（结果保存 + 历史页）
├── ✅ 回测增强 F（最大回撤）
└── ✅ 回测增强：NavChart 解耦（不再依赖基准）

✅ 第 2 批（已完成）
├── ✅ 行业分析（行业分析页 + 分布饼图 + 行业基准）
├── ✅ 行业数据补齐（从 Stock 实体读取行业字段）
├── ✅ 对比表增强（行业列）
├── ✅ Dashboard 增强（行业分布饼图）
└── ✅ 股票详情页增强（行业基准 PE/ROE 对比）

❌ 第 3 批（未开始）
└── ❌ 股息率地图（Treemap / Heatmap）
```

---

## 七、当前仍开放的问题

1. **行业数据源**：行业字段来自东方财富现有接口，但未专门追 `f100` 字段。当前依赖数据源中已有的行业映射
2. **基准指数 K 线**：基准指数历史日线在回测用例内部获取，数据源为现有 K 线适配器
3. **股息率地图**：需要全市场批量数据抓取 + 云端聚合快照，投入较大，暂缓
4. **回测行为变更**：股息复投现金池累积机制与初始版本不同，如有用户依赖旧行为需告知
