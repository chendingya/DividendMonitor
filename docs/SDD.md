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
- 状态管理：Zustand 或 Redux Toolkit，首期建议 Zustand
- 图表：ECharts
- 本地数据库：SQLite
- ORM/数据访问层：Drizzle ORM 或 Prisma，首期建议更轻量的 Drizzle ORM
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

## 6. 目录建议

首期目录在保证边界的前提下，应优先选择“够用的分层”，避免过深目录。当前目录简化计划见 `DIRECTORY-SIMPLIFICATION-PLAN.md`。

```text
DividendMonitor/
  docs/
    ARCHITECTURE.md
    DIRECTORY-SIMPLIFICATION-PLAN.md
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
- `dbService`：管理 SQLite 初始化、迁移和查询
- `settingsService`：管理本地配置
- `stockDataService`：统一股票、财务、分红数据查询入口
- `calculationService`：统一股息率、估算值等核心计算逻辑
- `logService`：错误与运行日志

### 7.2 渲染进程模块

- `dashboard`：首页与总览
- `stock-search`：股票搜索和加入自选
- `watchlist`：自选股管理
- `stock-detail`：单只股票详情与股息分析
- `comparison`：多股票对比
- `yield-map`：股息率地图
- `settings`：本地配置、数据源和指标口径说明

### 7.3 数据适配模块

对外部数据源做统一封装，避免业务逻辑直接依赖第三方接口。

首期限定为 A 股免费公开接口，建议采用“主源 + 补充校验源”的方式：

1. 主源：东方财富公开接口，覆盖行情、估值、部分财务和分红字段
2. 补充源：新浪财经、巨潮资讯或交易所披露页，用于补充分红实施、股本变更等字段
3. 本地缓存：所有拉取结果统一落本地 SQLite，减少接口波动影响

建议抽象接口：

- `searchStocks(keyword)`
- `getQuote(symbol)`
- `getCompanyMetrics(symbol)`
- `getDividendHistory(symbol, range)`
- `getFinancialSummary(symbol, period)`
- `getShareCapitalHistory(symbol, range)`
- `getTradingCalendar(range)`

## 8. 核心数据模型

### 8.1 Stock

```ts
type Stock = {
  symbol: string;
  name: string;
  market: string;
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

### 10.3 基于去年分红的未来股息率估算

首期不接受用户手工输入估算参数，系统自动根据可得数据生成结果，并展示全过程。

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

- 最近查看股票
- 自选股摘要
- 高股息股票概览
- 数据更新时间

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

- 选择买入日期
- 展示复投规则说明
- 展示回测结果卡片
- 展示分红与复投流水

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
  },
  visualization: {
    getYieldMap: (payload: any) => Promise<any>,
  },
  settings: {
    get: () => Promise<any>,
    set: (payload: any) => Promise<void>,
  },
};
```

### 12.2 IPC 事件建议

- `stock:search`
- `stock:get-detail`
- `stock:compare`
- `watchlist:list`
- `watchlist:add`
- `watchlist:remove`
- `calculation:historical-yield`
- `calculation:estimate-future-yield`
- `calculation:run-dividend-reinvestment-backtest`
- `visualization:yield-map`
- `settings:get`
- `settings:set`

## 13. 状态管理设计

首期建议使用按领域拆分的轻量状态管理。

建议 store：

- `useAppStore`
- `useWatchlistStore`
- `useSearchStore`
- `useStockDetailStore`
- `useComparisonStore`
- `useBacktestStore`
- `useSettingsStore`

原则：

1. 服务端或数据查询状态与 UI 状态分离
2. 持久化只保存必要配置和自选信息
3. 复杂计算尽量放主进程服务层，不放前端页面层

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
