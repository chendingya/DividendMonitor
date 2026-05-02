# DividendMonitor SDD

## 1. 文档目标

本文档描述 DividendMonitor 第一阶段桌面应用的系统设计方案，覆盖技术选型、总体架构、模块划分、数据模型、关键流程和分阶段实施建议，用于指导后续开发落地。

如需查看更细的代码分层、目录组织、组件抽象和依赖边界，配套参考 `ARCHITECTURE.md`。

## 2. 设计原则

1. 先本地化，再云化
2. 先单机可用，再考虑多端同步
3. 先保证数据口径一致，再扩展数据维度
4. 先完成分析闭环，再优化高级可视化
5. 架构预留扩展点，但避免首期过度设计

## 3. 技术选型

### 3.1 最终建议

- 桌面容器：Electron
- 前端框架：React
- UI 组件库：Ant Design
- 运行时：Node.js
- 构建工具：Vite
- 语言建议：TypeScript
- 路由：React Router
- 状态管理：当前以 React hooks + renderer services + `routeContext`/`localStorage` 的轻量方案为主；若后续全局交互明显增复杂，再评估 Zustand
- 图表：ECharts
- 本地数据库：SQLite（当前实现使用 Node 内建 `node:sqlite`，尚未引入第三方 SQLite npm 包）
- ORM/数据访问层：首期暂不引入 ORM，先用最小数据库封装；后续可在 Drizzle ORM 与 Prisma 中择一
- 主进程与渲染进程通信：Electron IPC + 预加载脚本
- 表单与校验：Ant Design Form + Zod
- 日志：electron-log
- 打包：electron-builder
- 首期市场：A 股
- 数据源策略：免费公开接口优先

### 3.2 React 作为唯一前端框架

首期前端框架固定为 React，不再保留 Vue 并行方案，原因如下：

1. Ant Design 在 React 生态中更成熟，官方组件和范式更完整
2. 适合构建高信息密度的管理台与分析类界面
3. 与 Electron + Vite + TypeScript 的组合成熟度高
4. 后续如需复杂图表、表格和状态管理，React 方案更容易形成稳定工程结构

## 4. 系统范围

### 4.1 第一阶段目标

- 提供 Windows 本地桌面端应用
- 首期仅覆盖 A 股
- 不依赖登录
- 不依赖云端
- 支持股票搜索、自选管理、股息率计算、未来股息率估算、股票比较和复投回测
- 支持基础图形化展示

### 4.2 后续预留能力

- 付费数据源切换
- 登录与同步
- 房价租售比
- 用户自定义指标
- 多市场扩展

## 5. 总体架构

建议采用 Electron 三层结构：

1. 主进程层
2. 预加载桥接层
3. 渲染进程前端层

另配本地数据层和外部数据适配层。

```text
+-------------------------------------------------------------+
|                       Electron Desktop App                  |
+------------------------+------------------------------------+
| Main Process           | Renderer Process                   |
| - App lifecycle        | - React pages                      |
| - Window management    | - Ant Design UI                    |
| - IPC handlers         | - Charts / tables                  |
| - Local DB access      | - View model / state               |
| - File system          |                                    |
+------------------------+------------------------------------+
            |                              |
            +---------- Preload API -------+
                           |
                    Local Services Layer
                           |
         +-----------------+------------------+
         |                                    |
      SQLite DB                       Data Source Adapter
                                      - A股行情数据
                                      - A股财务数据
                                      - A股分红数据
                                      - A股股本变更数据
```

补充说明：

1. 生产形态仍以 Electron 三层结构为主。
2. 为了让浏览器预览可联调，当前渲染层已增加运行时适配入口：
   - Electron 桌面端：`renderer service -> preload bridge -> IPC -> main`
   - 浏览器预览端：`renderer service -> browser fallback adapter`
3. 浏览器预览端的 fallback 目前只用于前端联调，不代表正式生产数据链路。
4. 外部数据接入已统一为 `SourceGateway` 网关模式（参见 `DATA-SOURCE-GATEWAY-ARCHITECTURE.md`），adapter 通过"能力声明"（capability）请求数据，不再直接拼接 URL 或管理降级逻辑。

## 6. 目录建议

首期目录在保证边界的前提下，应优先选择“够用的分层”，避免过深目录。当前目录已经完成一轮简化，目录职责与依赖方向以 `ARCHITECTURE.md` 为准。

```text
DividendMonitor/
  docs/
    ARCHITECTURE.md
    README.md
    PRD.md
    SDD.md
  src/
    main/
      adapters/
      application/
      domain/
      infrastructure/
      ipc/
      repositories/
      index.ts
    preload/
      index.ts
    renderer/
      src/
        layouts/
        router/
        pages/
        components/
        hooks/
        services/
        styles/
  resources/
  scripts/
  package.json
```

## 7. 模块拆分

本节描述系统功能模块；更细的分层职责、依赖方向和组件抽象，统一以 `ARCHITECTURE.md` 为准。

### 7.1 主进程模块

- `windowManager`：创建主窗口、处理应用生命周期
- `ipcHandlers`：接收渲染层请求并调用服务
- `dbService`：管理 SQLite 初始化、最小 schema 和查询
- `settingsService`：管理本地配置
- `stockDataService`：统一股票、财务、分红数据查询入口
- `calculationService`：统一股息率、估算值、回测等核心计算逻辑
- `industryService`：行业分析、分布统计、行业基准对比
- `authService`：Supabase 认证（登录、注册、登出、获取 session、修改密码）
- `dataSyncService`：本地与云端数据同步（推送/拉取/双向合并）
- `priceCacheService`：价格缓存管理（在线模式逐条推送至 Supabase，离线模式仅本地 SQLite）
- `logService`：错误与运行日志

### 7.2 渲染进程模块

- `dashboard`：首页与总览（持仓汇总、风险指标、相关性矩阵、行业分布）
- `stock-search`：股票搜索和加入自选
- `watchlist`：自选股管理
- `stock-detail`：单只股票详情与股息分析（含行业基准 PE/ROE 对比）
- `comparison`：多股票对比（含行业列）
- `industry-analysis`：行业分析（行业分布饼图、行业汇总表）
- `backtest`：回测（单股/多股对比、最大回撤、结果保存）
- `backtest-history`：回测历史（查看/删除已保存结果）
- `login`：登录与注册（注册需确认密码）
- `user-center`：用户中心（修改密码、数据同步、退出登录）
- `settings`：设置页（默认年份范围、排序指标、回测参数）
- `runtime-adapter`：统一选择 Electron bridge 或浏览器 fallback

当前实现补充：

1. 当前 renderer 已落地页面为：首页、个股详情页、自选页、对比页、回测页、回测历史页、行业分析页、设置页、用户中心页
2. `yield-map` 仍属于预留能力
3. 运行时适配已经落地在 `desktopApi.ts`、`browserRuntimeApi.ts` 与 `browserHttpRuntimeApi.ts`

### 7.3 数据适配模块

对外部数据源做统一封装，避免业务逻辑直接依赖第三方接口。

已接入数据源：

1. 股票（A 股）：东方财富公开接口（搜索 + 分红记录）+ 腾讯行情接口（实时行情）+ 新浪财经接口（全量历史 K 线）
2. ETF / 场外基金：东方财富公开接口（行情、基本档案 HTML 解析、分红记录 HTML 解析）+ 新浪财经接口（ETF 全量历史 K 线）
3. 估值分位：东方财富接口（PE / PB 历史序列 + 当前快照）
4. 本地缓存：自选已落 SQLite；估值链路已补 15 分钟内存缓存

适配器目录：

```
src/main/adapters/
├── contracts.ts                          # 数据源接口定义
├── index.ts
├── eastmoney/
│   ├── eastmoneyAShareDataSource.ts      # A 股搜索 + 行情 + 分红
│   ├── eastmoneyFundCatalogAdapter.ts    # 基金/ETF 搜索
│   ├── eastmoneyFundDetailDataSource.ts  # 基金/ETF 详情 + 分红 HTML 解析
│   ├── eastmoneyValuationAdapter.ts      # PE/PB 估值数据
│   └── eastmoneyUtils.ts                 # 共享工具函数
└── sina/
    └── sinaKlineDataSource.ts            # 新浪财经全量日 K 线（不复权）
```

基金 HTML 解析（`eastmoneyFundDetailDataSource.ts`）：
- `parseFundBasicProfile()` — 从基金档案页提取名称、类型、管理人、跟踪标的、单位净值、规模
- `parseFundDividendEvents()` — 从分红记录页解析分配事件
- `extractFieldText()` — 通用 HTML 字段提取，支持括号日期格式（如 `单位净值（04-27）：<b>1.2949</b>`）
- K 线数据优先级：新浪财经（全量历史，不复权）> 东财 push2his > 腾讯 qfqday
- 回测直接使用不复权价格——买入/分红再投均按实际成交价计算，期末市值正确
- 除权日价格下跌与分红到账现金增加天然对冲，收益率曲线无显著失真

## 8. 核心数据模型

### 8.1 资产身份与能力

所有资产通过 `AssetIdentifierDto` (`assetType:market:code`) 统一标识：

```ts
type AssetType = 'STOCK' | 'ETF' | 'FUND'
type MarketCode = 'A_SHARE'
type AssetKey = string  // e.g. "STOCK:A_SHARE:600519"

type AssetIdentifierDto = {
  assetType: AssetType
  market: MarketCode
  code: string
}
```

`AssetCapabilitiesDto` 声明每种资产支持的分析能力：

```ts
type AssetCapabilitiesDto = {
  hasIncomeAnalysis: boolean      // 历史收益率分析
  hasValuationAnalysis: boolean   // PE/PB 估值分位
  hasBacktest: boolean            // 股息复投回测
  hasComparisonMetrics: boolean   // 多资产对比
}
```

| 资产类型 | hasIncomeAnalysis | hasValuationAnalysis | hasBacktest | hasComparisonMetrics |
|----------|:---:|:---:|:---:|:---:|
| STOCK    | ✓ | ✓ | ✓ | ✓ |
| ETF      | ✓ |   | ✓ | ✓ |
| FUND     | ✓ |   | ✓ | ✓ |

### 8.2 资产详情模块化结构

`AssetDetailDto` 不再使用扁平字段，改为按功能模块组织：

```ts
type AssetDetailDto = {
  // 基础字段
  assetKey: AssetKey
  assetType: AssetType
  code: string; name: string; market: string
  latestPrice: number; latestNav?: number
  // ... 其他基础字段
  // 能力声明
  capabilities: AssetCapabilitiesDto
  // 模块化详情
  modules: AssetDetailModulesDto
}

type AssetDetailModulesDto = {
  income?: IncomeAnalysisDto       // 历史收益率 + 未来估算
  valuation?: ValuationSnapshotDto // PE/PB 估值（仅 STOCK）
  equity?: EquityAssetModuleDto    // 股票专属：行业/市值/PE/PB/总股本
  fund?: FundAssetModuleDto        // 基金专属：类型/管理人/跟踪标的/净值/规模
}
```

前端通过 `capabilities` 决定渲染哪些模块，不再硬编码 `assetType === 'STOCK'` 分支。

### 8.3 Stock（遗留，仅股票内部使用）
  industry?: string;
  currency?: string;
};
```

### 8.2 QuoteSnapshot

```ts
type QuoteSnapshot = {
  symbol: string;
  price: number;
  marketCap?: number;
  peRatio?: number;
  totalShares?: number;
  updatedAt: string;
};
```

### 8.3 DividendRecord

```ts
type DividendRecord = {
  symbol: string;
  announceDate?: string;
  recordDate?: string;
  exDate?: string;
  payDate?: string;
  fiscalYear?: number;
  calendarYear: number;
  dividendPerShare: number;
  totalDividendAmount?: number;
  payoutRatio?: number;
  source: string;
};
```

### 8.4 ShareCapitalRecord

```ts
type ShareCapitalRecord = {
  symbol: string;
  changeDate: string;
  totalShares: number;
  floatShares?: number;
  changeReason: string;
  source: string;
};
```

### 8.5 FinancialMetric

```ts
type FinancialMetric = {
  symbol: string;
  reportPeriod: string;
  revenue?: number;
  netProfit?: number;
  roe?: number;
  roic?: number;
  roi?: number;
  peRatio?: number;
  totalShares?: number;
};
```

### 8.6 WatchlistItem

```ts
type WatchlistItem = {
  symbol: string;
  groupName?: string;
  note?: string;
  createdAt: string;
};
```

### 8.7 BacktestResult

```ts
type BacktestResult = {
  symbol: string;
  buyDate: string;
  buyPrice: number;
  finalDate: string;
  finalShares: number;
  totalDividendsReceived: number;
  reinvestCount: number;
  finalMarketValue: number;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  totalFees: number;
  benchmarkReturn?: number;
  benchmarkAnnualizedReturn?: number;
};
```

### 8.8 CalculationResult

```ts
type CalculationResult = {
  symbol: string;
  year?: number;
  yearRange?: [number, number];
  historicalYield?: number;
  averageYield?: number;
  estimatedDividendPerShare?: number;
  estimatedFutureYield?: number;
  calculationBasis: string;
};
```

## 9. 本地数据库设计

### 9.1 建议表

- `stocks`
- `watchlist_items`
- `quote_snapshots`
- `financial_metrics`
- `dividend_records`
- `share_capital_records`
- `app_settings`
- `calculation_cache`
- `backtest_results`

### 9.2 设计说明

1. `stocks` 用于本地缓存基础证券信息
2. `watchlist_items` 保存用户自选
3. `quote_snapshots` 保存最近价格和估值指标快照
4. `financial_metrics` 保存财务摘要数据
5. `dividend_records` 保存分红明细，是核心计算基础
6. `share_capital_records` 保存总股本和流通股变化，用于处理定增、配股和送转增
7. `app_settings` 保存年份筛选、默认市场、排序和回测参数等设置
8. `calculation_cache` 可选，用于缓存复杂计算结果
9. `backtest_results` 可选，用于缓存回测结果和过程摘要

### 9.3 当前实现状态

截至当前代码：

1. 已正式落地的表只有 `watchlist_items` 与 `app_settings`
2. `watchlist_items` 已用于替代旧的 JSON 自选文件
3. 其他缓存表仍处于设计态，尚未开始落地
4. 当前数据库封装位于 `src/main/infrastructure/db/sqlite.ts`

## 10. 关键计算设计

### 10.1 自然年股息率

首期采用“事件级股息率累加口径”，而不是“全年累计每股分红 / 年末价格”。

公式示例：

```text
EventDividendYield_i = dividendPerShare_i / closePrice(recordDatePrevTradingDay_i)
NaturalYearDividendYield_y = Sum(EventDividendYield_i), for exDate_i in year y
```

设计说明：

1. 自然年归属按除权除息日 `exDate` 所在年份统计
2. 单次事件价格基准采用股权登记日前一交易日收盘价
3. 每次事件使用其当时的每股分红口径，天然适配定增、配股、回购注销等股本变化
4. 若只能拿到总分红金额，则按 `cashDividendTotal / marketCapOnRecordDatePrevClose` 计算，与每股口径等价
5. UI 必须展示“事件累加口径”和自然年归属规则

### 10.2 区间平均股息率

```text
AverageYield(startYear, endYear) =
  Average(NaturalYearDividendYield(year))
```

### 10.3 未来收益率估算

估算分为两套公式：股票使用财务数据驱动，ETF/基金使用历史分配记录驱动。

#### 股票方法（`estimateFutureYield`）

基于公司财务数据的两种方式：

方式一：基准估算，沿用上一年度分红比例

```text
EstimatedTotalDividend = latestAnnualNetProfit * lastAnnualPayoutRatio
EstimatedDividendPerShare = EstimatedTotalDividend / latestTotalShares
EstimatedFutureYield = EstimatedDividendPerShare / currentPrice
```

方式二：保守估算，延续上一年度分红总额

```text
EstimatedDividendPerShare = lastYearTotalDividendAmount / latestTotalShares
EstimatedFutureYield = EstimatedDividendPerShare / currentPrice
```

#### ETF / 基金方法（`estimateFundFutureYield`）

基于历史分配记录的两种方式：

方式一（baseline）：最近完整年份

```text
baselineDistPerShare = SUM(dividendPerShare for events in mostRecentYear)
estimatedFutureYield = baselineDistPerShare / latestPrice
```

方式二（conservative）：最近 1-3 年平均

```text
annualAvgDistPerShare = SUM(dividendPerShare for events in last 1-3 years) / yearCount
estimatedFutureYield = annualAvgDistPerShare / latestPrice
```

输入字段（`FundFutureYieldInput`）：
- `latestPrice`：当前价格（ETF 用市价，场外基金用单位净值）
- `dividendEvents`：历史分配事件列表

场外基金价格基准：
- 场外基金不通过交易所交易，行情接口 `f43` 可能返回累计净值而非单位净值
- 系统优先使用基金档案页 HTML 解析的"单位净值"（约 1-5 元量级）
- `extractFieldText` 支持 `标签（日期）：<标签>值</标签>` 格式的 HTML 解析

### 10.4 计算设计要求

1. 每个结果都要带出口径说明
2. 当输入字段缺失时要返回可解释的缺失原因
3. UI 上要显示采用的是哪种估算方式和完整公式链路
4. 对异常值要做边界保护和格式化

### 10.5 股息复投回测

首期回测模型：

1. 用户选择买入日期
2. 买入价格采用该交易日收盘价
3. 一次性买入后不再主动交易
4. 现金分红按 `payDate` 到账
5. 到账现金在下一个可交易日按收盘价全额复投同一股票
6. 送股、转增、拆合股仅调整持仓股数，不作为现金收益
7. 期末收益按最新可得收盘价估值

公式：

```text
TotalReturn = finalMarketValue / initialCost - 1
AnnualizedReturn = (finalMarketValue / initialCost) ^ (365 / holdingDays) - 1
```

界面必须展示：

- 买入日期与买入价格
- 每次分红到账金额
- 每次复投新增股数
- 期末持仓股数
- 总收益率和年化收益率

## 11. 页面设计映射

### 11.1 首页 Dashboard

展示内容：

- 投资组合持仓表格（汇总多笔交易为净持仓，支持编辑/删除/详情跳转）
- 投资组合摘要指标卡片：总收益率、总市值、加权平均收益指标
- 组合风险指标卡片：组合年化波动率、组合夏普比率、最大回撤
- 持仓相关性矩阵热力图（ECharts heatmap，红→蓝渐变显示正/负相关）
- 高收益机会检测（来自当前持仓的 Top 4）
- 最近浏览记录 + 快捷工具入口（回测、多股对比）
- 资产搜索入口 + 一键导入/导出持仓（CSV 报告 / JSON 持仓）
- 数据刷新入口

技术实现：`usePortfolio` 钩子（数据加载、富化、聚合）+ 5 个子组件：
- `DashboardHero` — 标题 + 操作按钮
- `DashboardMetricCards` — 两行指标卡片（收益 + 风险）
- `PortfolioTable` — 持仓明细表格
- `DashboardOpportunities` — 高收益机会
- `DashboardTools` — 最近浏览 + 快捷工具
- `CorrelationMatrix` — 相关性矩阵热力图

### 11.2 股票搜索页

功能：

- 关键词搜索
- 搜索结果列表
- 加入自选
- 跳转详情

### 11.3 股票详情页

功能：

- 基础信息
- 历史自然年股息率图表
- 年份/范围切换
- 分红记录表
- 未来股息率估算卡片
- 估算过程展开面板

### 11.4 自选股页

功能：

- 自选列表
- 排序
- 过滤
- 批量对比入口

### 11.5 股票比较页

功能：

- 多股表格对比
- 指标排序
- 高亮最大值/最小值
- 快速切换年份

### 11.6 股息率地图页

功能：

- 按行业或分组生成地图
- 根据股息率映射颜色
- 点击图块进入详情

### 11.7 回测页

功能：

- 选择买入日期、初始资金、费率参数
- 可选基准指数对比
- 可选定投配置（频率/金额）
- 展示最大回撤与回测结果卡片
- 展示分红与复投流水
- 支持多股对比回测（URL `symbols` 参数逗号分隔）
- 保存回测结果到历史记录
- 跳转回测历史页

### 11.8 回测历史页

功能：

- 展示已保存回测记录列表（名称/标的/买入日期/收益率/最大回撤/手续费/创建时间）
- 支持查看回测详情（跳转至回测页回放）
- 支持删除记录

### 11.9 行业分析页

功能：

- 持仓行业分布饼图
- 行业汇总指标表（股票数量/平均股息率/平均PE/平均ROE）
- 支持行业详情展开（行业个股明细表）
- 行业基准对比（行业均值 PE/ROE vs 个股票）

## 12. IPC 设计

建议对渲染层暴露受控 API，不直接开放 Node.js 全权限。

### 12.1 preload 暴露接口示例

```ts
window.dividendMonitor = {
  stock: {
    search: (keyword: string) => Promise<Stock[]>,
    getDetail: (symbol: string) => Promise<any>,
    compare: (symbols: string[]) => Promise<any[]>,
  },
  watchlist: {
    list: () => Promise<WatchlistItem[]>,
    add: (symbol: string) => Promise<void>,
    remove: (symbol: string) => Promise<void>,
  },
  calculation: {
    getHistoricalYield: (symbol: string, payload: any) => Promise<CalculationResult>,
    estimateFutureYield: (symbol: string, payload: any) => Promise<CalculationResult>,
    runDividendReinvestmentBacktest: (symbol: string, payload: any) => Promise<BacktestResult>,
  }
};
```

### 12.2 IPC 事件清单

- `asset:search` / `asset:get-detail` / `asset:compare`
- `stock:search` / `stock:get-detail` / `stock:compare`（兼容层）
- `watchlist:list` / `watchlist:add` / `watchlist:remove`
- `calculation:historical-yield` / `calculation:estimate-future-yield` / `calculation:run-dividend-reinvestment-backtest`
- `calculation:historical-yield-for-asset` / `calculation:estimate-future-yield-for-asset` / `calculation:run-backtest-for-asset`
- `backtest:history-list` / `backtest:history-save` / `backtest:history-delete`
- `industry:analysis` / `industry:distribution` / `industry:benchmark`
- `portfolio:list` / `portfolio:upsert` / `portfolio:remove` / `portfolio:getRiskMetrics`
- `auth:login` / `auth:register` / `auth:logout` / `auth:getSession` / `auth:update-password`
- `sync:push` / `sync:pull` / `sync:bidirectional` / `sync:get-status`

### 12.3 当前运行时补充说明

1. Electron 桌面端仍以 preload + IPC 为正式调用链
2. 浏览器预览端当前不具备 preload bridge，因此通过渲染层 runtime adapter 回退到 browser fallback
3. browser fallback 当前覆盖 `stock`、`watchlist`、`calculation` 三组接口的最小联调能力
4. Web 预览中的自选数据当前使用浏览器本地存储，而不是 SQLite

## 13. 状态管理设计

当前实现使用“页面 hook + renderer service + 必要本地持久化”的轻量状态组织，尚未引入统一全局 store。

当前主要状态入口：

- `useWatchlist`
- `useStockDetail`
- `useComparison`
- `useBacktest`
- `portfolioStore.ts`
- `routeContext.ts`

原则：

1. 服务端或数据查询状态与 UI 状态分离
2. 持久化只保存必要配置和自选信息
3. 复杂计算尽量放主进程服务层，不放前端页面层
4. 若跨页面共享状态继续增长，再把成熟模块提升为独立 store，而不是过早全局化

## 14. 可视化设计

### 14.1 图表

建议采用 ECharts：

- 年度股息率柱状图
- 区间趋势折线图
- 分红记录时间轴
- 回测净值与持仓变化曲线

### 14.2 地图

首期“股息率地图”更适合定义为收益分布热力图或矩形树图，而不是地理地图。

优先实现：

1. Treemap 展示行业/分组权重与股息率
2. Heatmap 展示年份与股票之间的股息率变化

## 15. 错误处理与降级

1. 数据源不可用时，显示本地缓存数据及更新时间
2. 部分字段缺失时，允许页面局部展示，不阻断整页
3. 估算所需字段不足时，明确提示缺失字段
4. 回测所需历史价格或分红数据缺失时，禁止输出误导性结果
5. 计算失败时，记录日志并返回用户可理解的错误信息

## 16. 安全设计

1. 开启 `contextIsolation`
2. 关闭 `nodeIntegration`
3. 所有系统能力通过 preload 白名单暴露
4. 渲染层不直接访问文件系统和数据库
5. 对 IPC 输入做参数校验

## 17. 性能设计

1. 列表分页或虚拟滚动，避免大表格卡顿
2. 图表按需加载
3. 数据查询结果缓存到本地
4. 重计算逻辑放主进程或 worker 中
5. 首屏只加载核心模块

## 18. 配置与扩展点

### 18.1 可配置项

- 默认市场
- 默认年份范围
- 默认排序指标
- 数据刷新策略
- 回测默认初始资金
- 回测手续费开关

### 18.2 扩展点

- 多数据源适配器
- 多资产类型模块
- 自定义指标和公式
- 登录与同步模块

## 19. 开发分阶段建议

### Phase 0：工程初始化

- 搭建 Electron + React + Ant Design + TypeScript 工程
- 接入路由、状态管理、日志和 SQLite
- 建立 IPC 基础设施
- 接通 A 股免费数据源 PoC

### Phase 1：核心数据与分析

- 股票搜索
- 自选管理
- 股票详情
- 自然年股息率计算
- 年份范围筛选
- 未来股息率估算
- 股息复投回测

### Phase 2：比较与可视化

- 股票比较页
- Treemap/Heatmap
- 指标排序和过滤

### Phase 3：扩展能力

- 多市场支持
- 房价租售比模块
- 账号和同步

## 20. 测试建议

### 20.1 单元测试

- 计算公式
- 分红归属年份逻辑
- 字段缺失和边界条件

### 20.2 集成测试

- IPC 调用
- 本地数据库读写
- 数据适配器转换
- 回测流水重放

## 23. 当前实现对齐状态（2026-05-01）

1. Electron + React + preload + IPC 主链路已可运行
2. 多资产架构已落地：`AssetProviderRegistry` + `StockAssetProvider` / `EtfAssetProvider` / `FundAssetProvider`
3. `AssetCapabilitiesDto` + `AssetDetailModulesDto` 贯穿共享合约、Mapper、Mock 数据和前端渲染
4. 前端能力驱动渲染：`StockDetailPage` 通过 `data.capabilities` 决定展示估值模块或基金画像模块
5. 自选持久化已从 JSON 文件切换到 SQLite，当前使用 `node:sqlite`
6. 开发态 Electron 的 `userData` 已切换到项目内 `.runtime-data`
7. 渲染层已增加 runtime adapter，浏览器预览可通过 fallback 跑通搜索、自选、对比、详情和回测的最小链路
8. ETF/基金详情、历史分配收益率、未来分配率估算已实现
9. 基金数据源使用 `fqt=0`（未复权）K 线，与股票端未复权价格口径一致
10. 场外基金优先使用单位净值作为价格基准，避免累计净值干扰
11. ROE 指标已实现：从东方财富 push2 API `f173` 字段提取，展示在 `StockDetailPage`（估值卡片区 + 行业基准对比）和 `ComparisonTable`（对比列）
12. 年化波动率与夏普比率已实现：`riskMetricsService.ts` 计算，展示在详情页和对比表
13. SQLite 资产数据缓存层已实现：`AssetSnapshotRepository` + 启动同步 `AssetCacheSyncService`
14. 组合风险领域服务已实现：`portfolioRiskService.ts` 计算组合波动率、夏普比率、最大回撤、相关性矩阵
15. Dashboard 已重构：852 行拆分为 `usePortfolio` 钩子 + 5 个子组件 + `CorrelationMatrix` 热力图 + `IndustryDistributionPie` 饼图
16. IPC 通道新增：`portfolio:getRiskMetrics`、`industry:analysis/distribution/benchmark`、`backtest:history-list/save/delete`
17. 在线版已落地：Supabase 认证（`authService`）+ 数据同步（`dataSyncService`）+ 用户中心
18. 注册流程增加确认密码校验
19. 用户中心新增修改密码功能（IPC: `auth:update-password`，HTTP: `POST /api/auth/update-password`）
20. 数据同步策略：推送 = 覆盖云端、拉取 = 覆盖本地、双向 = 按 key 合并取并集
21. 回测增强已实现：最大回撤指标（域服务跟踪峰谷跌幅）、多股对比回测（`BacktestMultiCompare` 组件）、回测历史（保存/查看/删除）
22. 行业分析已实现：`IndustryDistributionPie` 共享饼图组件、行业基准对比（`getIndustryBenchmark`）、Dashboard 行业分布卡片
23. 设置页增强：默认年份范围选择器、回测参数默认值同步到买入日期
24. 价格缓存同步简化：在线模式通过 `savePriceHistory` 逐条推送至 Supabase，离线累积数据在下次缓存过期刷新时自动同步
25. 对比表新增行业列、最大回撤列；回测 NavChart 不再依赖基准数据即可渲染

### 20.3 E2E 测试

- 搜索股票并加入自选
- 查看历史股息率
- 进行未来股息率估算
- 多股票比较
- 运行股息复投回测

## 21. 待确认技术问题

1. 东方财富公开接口是否能稳定覆盖分红实施、股权登记日和总股本变动字段
2. 分红跨年时按公告日、除权日还是派息日归属自然年
3. ROI 是否保留为独立字段，还是统一使用 ROE/ROIC
4. 本地数据库是否只缓存近期数据，还是做完整历史归档
5. 回测首期是否纳入手续费、印花税和最小交易单位约束

## 22. 建议的下一步输出

基于本 SDD，建议后续继续补充以下文档：

1. 数据源适配设计文档
2. 数据库表结构 DDL
3. IPC 接口清单
4. 页面信息架构与低保真原型
5. 开发任务拆解与里程碑计划
