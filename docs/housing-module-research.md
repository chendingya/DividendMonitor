# 房价房租模块：调研与初步设计

## 文档信息

- 创建日期：2026-04-30
- 状态：调研完成，初步设计阶段
- 关联文档：PRD.md（§8.3 V2 预研、§16 Phase 3）、SDD.md（§4.2 后续预留）
- PRD 原文定位：*"房价与房租的租售比分析"、"股票与房产收益视角对照"*

---

## 一、产品定位

### 1.1 与现有功能的关系

DividendMonitor 的核心心智是"收息"——以现金流收益（股息/租金）为锚点评估资产。股票和房产在这一点上有天然的可比性：

| 维度 | 股票 | 房产 |
|------|------|------|
| 资产价格 | 股价 | 房价（元/㎡） |
| 现金流收益 | 股息 | 租金 |
| 收益率指标 | 股息率 | 租金收益率（年租金/房价） |
| 估值指标 | PE/PB 分位 | 租售比（房价/年租金）、房价收入比 |
| 历史趋势 | 历史股息率走势 | 历史房价/租金走势 |
| 再投资 | 股息复投 | 租金再投资（理论） |

### 1.2 用户画像匹配

PRD §4.2 次级用户：*"想把股票与房产租售比放在同一收益框架中比较的资产配置用户"*。这个模块服务于已经持有或关注房产、同时投资股票的用户，帮助他们做跨资产类别的收益比较决策。

### 1.3 核心使用场景

1. **租售比速查**：用户想知道某个城市/区域的租售比是多少，是否值得购买
2. **跨资产收益对比**：房产租金收益率 1.5% vs 茅台股息率 3.2%，该如何配置资金
3. **房价趋势观察**：追踪关注城市的房价/租金变化趋势
4. **购房决策辅助**：房贷计算器 + 租售比，帮助判断"买房 vs 租房"的财务优劣

---

## 二、数据源调研

### 2.1 综合评估

| 数据源 | 类型 | 覆盖 | 粒度 | 稳定性 | 获取难度 | 采用 |
|--------|------|------|------|--------|---------|------|
| 国家统计局新版 API V2.0 | 官方免费 | 70 城 | 城市级指数 | 高 | 低（需多步调用） | **首期采用** |
| 中指研究院百城报告 | 第三方 | 100 城 | 城市级均价 | 中 | 低（免费报告） | 后续评估 |
| 地方数据开放平台 | 官方免费 | 部分城市 | 小区级 | 中 | 中（各城市接口不统一） | 不采用 |
| 贝壳找房爬虫 | 非官方 | 已接入城市 | 小区/房源级 | 低（反爬严） | 高 | 不采用 |
| 易源数据 API | 商业免费层 | 全国 | 城市级 | 中 | 低 | 备选 |
| 房天下 API | 商业 | 全国 | 小区级 | 中 | 中（100次/天免费） | 不采用 |
| akshare (Python) | 开源封装 | 全国 | 城市级 | 中 | 低（非 Node.js） | 不采用 |

### 2.2 数据源方案

**首期策略：指数趋势 + 用户补充，不做绝对价格**

| 数据层 | 来源 | 内容 | 说明 |
|--------|------|------|------|
| **核心数据** | 国家统计局新版 API V2.0 | 70 城二手/新建住宅价格指数（环比/同比/定基） | 免费、稳定、月度更新 |
| **租金数据** | 自动获取优先 + 用户手动录入 | 城市级月租金（元/㎡·月） | 自动获取来自易源数据 API（如有）或内置参考值；用户可手动修正 |
| **房价数据** | 用户手动录入（补充） | 具体小区/区域的绝对价格 | 非必需，仅当用户需要精确计算租金收益率时使用 |

**为什么首期不做绝对价格**：

1. 统计局只给指数（相对变化），不给绝对元/㎡价格——这是数据可得性的硬约束
2. 中指研究院百城报告有绝对均价，但为 PDF 报告形式，需人工提取或等待结构化 API
3. 房价指数已经能反映趋势（涨了还是跌了、幅度多少），对于宏观观察足够
4. 用户最关心的跨资产对比核心指标"租金收益率"，可以用指数 + 用户自填价格来计算

#### 国家统计局新版 API V2.0

- 基础 URL：`https://data.stats.gov.cn/dg/website/publicrelease/web/external`
- 无需鉴权，公开访问
- 数据：月度环比/同比/定基指数（新建商品住宅 + 二手住宅）
- 更新频率：每月 15 日左右
- 覆盖范围：**70 个大中城市**（一线 4 + 新一线 15 + 二线 30 + 三线 21）
- 调用流程：
  1. `POST /new/queryIndexTreeAsync` — 获取分类树，定位"商品住宅销售价格指数"对应的 cid
  2. `POST /new/queryIndicatorsByCid` — 获取指标列表
  3. `POST /getEsDataByCidAndDt` — 获取具体数值

可用指标包括：
- 新建商品住宅销售价格指数（环比/同比/定基）
- 二手住宅销售价格指数（环比/同比/定基）
- 90㎡以下 / 90-144㎡ / 144㎡以上分面积段指数

#### 租金数据策略

**自动获取（默认）**：
- 优先使用易源数据 API（`route.showapi.com`）的房价指数接口，内含城市级租金参考
- 如不可用，使用内置的 70 城参考租金数据（随应用发布，基于公开统计数据）

**手动录入（补充）**：
- 用户在房价观察页可直接修改租金数值
- 手动数据优先级高于自动数据
- 存储在本地 `user_housing_data` 表中
- 在线模式下可同步到 Supabase

#### 房价数据（用户补充）

- 用户可在城市详情页手动输入关注的区域/小区房价（元/㎡）
- 用于精确的租金收益率计算
- 完全可选，不输入时仅展示指数趋势

### 2.3 数据获取架构

```
src/main/adapters/
├── housing/
│   ├── contracts.ts              # HousingDataSource 接口
│   ├── nbsStatsAdapter.ts        # 国家统计局 API 适配器（70城指数）
│   └── localHousingData.ts       # 内置 70 城默认数据（首次离线启动用）
```

遵循现有适配器模式，与 `eastmoney/` 目录平级。租金数据的自动获取在 `housingRepository` 层聚合（适配器 + 用户数据 + 内置数据优先级合并）。

### 2.4 数据存储与更新策略

遵循现有的本地/云端双层存储机制，与 `AssetSnapshotRepository` 模式保持一致，避免相同数据反复拉取。

**本地存储（SQLite）**

```sql
-- 房价指数缓存（按月，每城市一行）
CREATE TABLE IF NOT EXISTS housing_index_cache (
  city_code TEXT NOT NULL,
  period TEXT NOT NULL,           -- YYYY-MM
  new_home_index_mom REAL,        -- 新建住宅环比
  new_home_index_yoy REAL,        -- 新建住宅同比
  second_hand_index_mom REAL,     -- 二手住宅环比
  second_hand_index_yoy REAL,     -- 二手住宅同比
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (city_code, period)
);

-- 用户手动录入的房价/租金数据
CREATE TABLE IF NOT EXISTS user_housing_data (
  id TEXT PRIMARY KEY,
  city_code TEXT NOT NULL,
  district TEXT,                  -- 可选：区级
  community TEXT,                 -- 可选：小区
  price_per_sqm REAL,             -- 用户录入房价（元/㎡）
  rent_per_sqm REAL,              -- 用户录入月租金（元/㎡·月）
  note TEXT,
  updated_at TEXT NOT NULL
);

-- 城市关注列表
CREATE TABLE IF NOT EXISTS housing_watchlist (
  city_code TEXT PRIMARY KEY,
  city_name TEXT NOT NULL,
  added_at TEXT NOT NULL
);
```

**缓存策略**（跟现有机制一致）：

- 房价指数数据 TTL：**30 天**（月度数据，变化频率低）
- 读取流程：先查本地缓存 → 未命中或过期则请求统计局 API → 写入本地缓存
- 在线模式：可选同步关注列表到 Supabase
- 离线模式：完全本地操作，首次启动用内置默认数据

**内置默认数据**：

`localHousingData.ts` 内置一份 70 城基准数据快照，随应用发布。数据来源为国家统计局公开发布的最新一期 70 城指数，确保用户首次离线启动时也有可用数据。

### 2.5 关键局限与风险

1. **只做指数不做绝对价格**：统计局只给环比/同比/定基指数，用户无法直接看到"北京均价 60000/㎡"这样的绝对数字，除非自行录入
2. **租金数据质量**：自动获取的租金数据可能不准确或缺失，需要用户手动修正
3. **数据频率低**：房价指数为月度更新（每月 15 日发布上月数据），不是日级数据
4. **统计局 API 稳定性**：新版 API V2.0 未经长期验证，如接口变更需要更新适配器
5. **城市覆盖固定**：70 城是统计局的固定清单，不包含所有地级市

---

## 三、初步架构设计

### 3.1 是否纳入多资产框架？

**推荐方案：作为独立模块，不强行纳入 AssetProvider 体系。**

理由：
1. 房产的数据结构、指标体系和股票差异太大——没有"分红事件"、"PE/PB"、"回测复投"等概念
2. 房产的 `AssetCapabilitiesDto` 四个标志（hasIncomeAnalysis / hasValuationAnalysis / hasBacktest / hasComparisonMetrics）的含义完全不同
3. 独立模块避免污染现有 `AssetProviderRegistry` 的抽象
4. 独立的 IPC 通道和页面，URL 命名空间独立（`/housing/*`）

**仅在"跨资产收益对比"视图中建立关联**——这是一个新的页面/组件，同时读取股票和房产的数据，做横向对比。

### 3.2 资产模型

```ts
// 城市标识
type CityIdentifier = {
  cityCode: string          // 行政区划代码，如 "110000"（北京）
  cityName: string          // 如 "北京"
  district?: string         // 区级，如 "朝阳区"（用户手动录入时可选）
}

// 房价指数快照（来自统计局 API）
type HousingIndexSnapshot = {
  city: CityIdentifier
  period: string              // 数据月份 YYYY-MM
  // 二手住宅指数（环比/同比/定基，以 2020 年为基期）
  secondHandMoM: number       // 环比涨跌幅（%）
  secondHandYoY: number       // 同比涨跌幅（%）
  newHomeMoM: number          // 新建住宅环比
  newHomeYoY: number          // 新建住宅同比
  // 可选：分面积段
  areaSegments?: HousingAreaSegment[]
}

// 用户补充数据
type UserHousingData = {
  cityCode: string
  district?: string
  community?: string
  pricePerSqm?: number        // 用户录入房价（元/㎡）
  rentPerSqm?: number         // 用户录入月租金（元/㎡·月）
  note?: string
}

// 聚合后的展示模型（适配器/仓库聚合层拼接）
type HousingDisplayData = {
  city: CityIdentifier
  // 指数数据（自动获取）
  indexData: HousingIndexSnapshot[]
  // 租金数据（自动获取优先，用户数据覆盖）
  rentPerSqm?: number           // 有效月租金（元/㎡·月）
  rentSource: 'auto' | 'manual' | 'builtin'
  // 房价数据（仅用户手动录入时有值）
  userPricePerSqm?: number
  // 衍生指标（仅当租金和房价都有值时计算）
  rentalYield?: number          // 租金收益率 = 年租金 / 房价
  priceToRentRatio?: number     // 租售比 = 房价 / 年租金（年）
}
```

### 3.3 核心指标计算

```ts
// 租金收益率（类比股息率）——需要用户提供房价，否则仅展示指数趋势
rentalYield = (rentPerSqm * 12) / pricePerSqm

// 租售比（类比 PE，多少年租金能收回房价）
priceToRentRatio = pricePerSqm / (rentPerSqm * 12)

// 房价指数趋势（从统计局数据中计算）
// 例如：近 12 个月二手住宅环比累计变化、同比变化趋势
```

**关键设计决策**：租金收益率和租售比**依赖用户手动录入房价**。仅用指数数据时，前端展示的是"房价指数趋势图"和"租金收益率趋势（如有租金数据）"。当用户录入房价后，才能看到精确的租金收益率和租售比数字。

中国主要城市参考区间（基于公开统计数据）：

| 城市 | 二手住宅指数趋势 | 参考月租金(元/㎡) | 估算租金收益率 |
|------|-----------------|-------------------|---------------|
| 北京 | 环比企稳 | ~100 | ~1.5-2.0% |
| 上海 | 环比微涨 | ~90 | ~1.5-2.0% |
| 深圳 | 环比波动 | ~85 | ~1.5-1.8% |
| 广州 | 环比平稳 | ~55 | ~1.8-2.2% |
| 杭州 | 环比微涨 | ~50 | ~1.8-2.2% |
| 成都 | 环比平稳 | ~35 | ~2.0-2.6% |
| 武汉 | 环比波动 | ~30 | ~2.0-2.5% |

可见中国城市租金收益率普遍在 1.5%-2.5%，远低于 A 股高股息标的 4%-7% 的股息率。这正是跨资产对比的核心价值——在同一收益框架下直观比较。

### 3.4 页面设计

#### 3.4.1 房价观察页 `/housing`

```
HousingPage
├── PageHeader（标题"房价观察" + 城市选择器）
├── HousingMetricCards
│   ├── 二手均价（元/㎡）
│   ├── 租金收益率
│   ├── 租售比
│   └── 环比涨跌幅
├── PriceTrendChart（ECharts 折线图）
│   ├── 二手房价指数走势（多城叠加）
│   └── 时间范围选择器
├── CityComparisonTable
│   ├── 已关注城市列表
│   ├── 均价/租金/租金收益率/租售比/环比/同比
│   └── 排序 + 高亮最优/最弱
└── RentTrendChart（可选：租金走势）
```

#### 3.4.2 资产收益对比页 `/cross-asset`

**散点图** 是展示跨资产收益对比的核心视觉形式：

- **X 轴**：风险维度（股票的波动率 / 房产的指数波动）
- **Y 轴**：收益率（股息率 / 租金收益率）
- **每个点**代表一个资产（蓝色 = 股票，橙色 = 房产）
- 理想的资产在左上角：低风险 + 高收益
- 支持悬停查看详情、点击跳转

```
CrossAssetComparePage
├── PageHeader（标题"跨资产收益对比"）
├── 散点图区域（主视图，ECharts scatter）
│   ├── X 轴：风险（股票=年化波动率, 房产=房价指数波动率）
│   ├── Y 轴：收益率（股票=估算股息率, 房产=租金收益率）
│   ├── 蓝色散点 = 自选/持仓股票
│   ├── 橙色散点 = 已关注城市
│   └── 参考线：Y=无风险利率（国债/定期存款）
├── 底部图例 + 数据表格
│   ├── 股票列表（代码 + 股息率 + 波动率）
│   └── 城市列表（城市 + 租金收益率 + 指数波动率）
└── 控制栏（筛选：仅股票 / 仅房产 / 全部 / 按标签）
```

#### 3.4.3 房贷计算器（可选子页面）`/housing/mortgage`

```
MortgageCalculatorPage
├── 输入区
│   ├── 房屋总价（万元）
│   ├── 首付比例（%）
│   ├── 贷款年限（年）
│   ├── 贷款利率（LPR + 基点）
│   └── 还款方式（等额本息 / 等额本金）
├── 结果展示
│   ├── 月供
│   ├── 利息总额
│   ├── 还款总额
│   └── 利息占比
└── 还款计划表（分期明细）
```

### 3.5 路由规划

```
/housing                  →  HousingPage           # 房价观察主页（70城列表+指数趋势）
/housing/:cityCode        →  HousingCityDetail     # 单城市详情（指数走势+手动录入门）
/cross-asset              →  CrossAssetComparePage # 跨资产收益对比（散点图）
/housing/mortgage         →  MortgageCalculatorPage # 房贷计算器
```

### 3.6 新增文件清单（预估）

```
领域层：
  src/main/domain/entities/Housing.ts               # HousingSnapshot, CityIdentifier
  src/main/domain/services/housingCalculationService.ts  # 租金收益率/租售比计算
  src/main/domain/services/mortgageCalculationService.ts # 房贷计算

适配器层：
  src/main/adapters/housing/contracts.ts             # HousingDataSource 接口
  src/main/adapters/housing/nbsStatsAdapter.ts       # 国家统计局 API
  src/main/adapters/housing/localHousingData.ts      # 内置默认数据

仓库层：
  src/main/repositories/housingRepository.ts         # 聚合适配器 + 缓存

用例层：
  src/main/application/useCases/getHousingData.ts
  src/main/application/useCases/getCityList.ts
  src/main/application/useCases/calculateMortgage.ts

IPC 通道：
  housing:get-data       →  getHousingData(cityCode)
  housing:list-cities    →  listCities()
  housing:search-city    →  searchCity(keyword)
  housing:calculate-mortgage → calculateMortgage(params)

前端页面：
  src/renderer/src/pages/HousingPage.tsx
  src/renderer/src/pages/CrossAssetComparePage.tsx
  src/renderer/src/pages/MortgageCalculatorPage.tsx

前端组件：
  src/renderer/src/components/housing/HousingMetricCards.tsx
  src/renderer/src/components/housing/PriceTrendChart.tsx
  src/renderer/src/components/housing/CityComparisonTable.tsx
  src/renderer/src/components/housing/CrossAssetCompareChart.tsx
  src/renderer/src/components/housing/MortgageForm.tsx
  src/renderer/src/components/housing/RepaymentSchedule.tsx

前端 hook：
  src/renderer/src/hooks/useHousingData.ts
  src/renderer/src/hooks/useMortgage.ts

共享契约：
  shared/contracts/housing.ts                          # HousingDto 类型

数据库 schema 扩展（SQLite）：
  housing_snapshots 表     # 缓存房价/租金快照
  user_housing_data 表     # 用户自填数据
  housing_watchlist 表     # 用户关注的城市列表

路由：
  新增 /housing, /housing/:cityCode, /cross-asset, /housing/mortgage
```

---

## 四、与现有功能的联动

### 4.1 Dashboard 集成

- 在指标卡片行末尾增加"租金收益率"卡片（如果用户关注了城市）
- 在机会区域增加"跨资产收益对比"入口

### 4.2 对比页集成思路

当前 `ComparisonPage` 只支持同类型资产对比。跨资产对比需要一个新的视图（`CrossAssetComparePage`），因为股票和房产的指标维度不同，无法放在同一个表格中。

散点图（X 轴=风险/波动率，Y 轴=收益率）是统一的视觉语言——股票和房产在同一个坐标系中各占一片区域，用户一眼就能看到哪个资产的风险收益比更优。

### 4.3 搜索集成

顶栏全局搜索框可以考虑支持城市搜索（输入"北京房价"跳转到 `/housing/110000`），但首期可以只通过导航进入。

---

## 五、实施阶段建议

### Phase 1：数据 + 房价基础展示（首个迭代）

- 实现国家统计局 API 适配器（`nbsStatsAdapter.ts`，70 城二手/新建住宅指数）
- 内置 70 城默认数据（`localHousingData.ts`，首次离线启动用）
- 本地 SQLite 缓存（`housing_index_cache` 表，30 天 TTL，不重复拉取已有数据）
- 房价观察页（`HousingPage`）：城市选择 + 价格指数趋势图 + 指标卡片
- 用户关注城市列表（`housing_watchlist`，本地存储，在线可同步）
- 房贷计算器（纯前端计算，无后端依赖）

### Phase 2：跨资产对比（核心差异化功能）

- 跨资产收益对比页（`CrossAssetComparePage`）
- 散点图（`ECharts scatter`）：X 轴=风险/波动率，Y 轴=收益率
- 股票（蓝色）vs 房产（橙色）散点，悬停详情 + 点击跳转
- Dashboard 集成房产收益卡片
- 租金数据自动获取 + 手动录入功能
- 用户手动录入房价/租金（`user_housing_data` 表，本地 + 云端同步）

### Phase 3：数据增强（可选）

- 中指研究院百城均价结构化数据接入（如果 API 可用）
- 房价估值分位（类似 PE 分位——当前房价指数处于历史的什么位置）
- 更多城市的详细数据
- 租金趋势分析

---

## 六、已确认决策

| 决策项 | 结论 |
|--------|------|
| 定价数据策略 | **只做指数趋势**（统计局环比/同比/定基），不做绝对元/㎡价格。用户可手动录入房价以计算精确指标 |
| 城市范围 | **首期覆盖 70 城**（统计局标准清单），包含一线/新一线/二线/三线 |
| 租金数据 | **自动获取优先，接受手动录入**。默认用自动数据，用户可覆盖修正。手动数据优先级 > 自动 > 内置 |
| 跨资产对比 UI | **散点图**（X 轴=风险/波动率，Y 轴=收益率），股票蓝点 + 房产橙点，同坐标系对比 |
| 数据存储与更新 | **跟现有机制一致**。本地 SQLite 缓存 + 30 天 TTL + 云端 Supabase 可同步。不重复拉取已有数据 |
| 暗色模式 | 暂不纳入规划 |
