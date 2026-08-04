# 房价房租模块：调研与初步设计

## 文档信息

- 创建日期：2026-04-30
- 状态：调研完成，初步设计阶段（2026-08-03 复核更新：数据源结论修订 + 东财/中指双数据源 Spike 已验证）
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

> **2026-08-03 复核修订**：以下为更新后的评估表。主要变化：
> 1. **东财数据接口成为首期首选**（Spike 已验证，复用现有网关，详见 §2.6）
> 2. **统计局 API 降级为备选**（可用但多步调用；且 2023 年起"定基指数"已停止发布，仅剩环比/同比）
> 3. **中指研究院官网公开页面可直接提供绝对房价 + 绝对租金**（详见 §2.7 验证结果），解决"只做指数"的最大痛点
> 4. 禧泰数据（creprice.cn）公开页面存在验证码反爬，降级为商业 API 备选

| 数据源 | 类型 | 覆盖 | 粒度 | 稳定性 | 获取难度 | 采用 |
|--------|------|------|------|--------|---------|------|
| **东方财富数据接口**（`RPT_ECONOMY_HOUSE_PRICE`） | 免费 | 70 城 | 城市级指数（环比/同比） | 高（复用现有东财链路） | **低（单接口全量，已 Spike 验证）** | **首期采用** |
| 中指研究院官网 | 官方免费 | 百城 + 50 城租金 | 城市级**绝对均价 + 绝对租金** | 高 | 中（SSR 页面解析，见 §2.7） | **首期采用（补充绝对价格）** |
| 国家统计局新版 API V2.0 | 官方免费 | 70 城 | 城市级指数 | 高 | 中（需多步调用） | 备选 |
| 中指研究院百城报告（PDF） | 第三方 | 100 城 | 城市级均价 | 中 | 低（免费报告） | 后续评估（与官网数据同源） |
| 禧泰数据（creprice.cn） | 第三方 | 337 城 | 城市级均价/租金 | 中 | 中（公开页有验证码反爬，需商业 API） | 备选 |
| 地方数据开放平台 | 官方免费 | 部分城市 | 小区级 | 中 | 中（各城市接口不统一） | 不采用 |
| 贝壳找房爬虫 | 非官方 | 已接入城市 | 小区/房源级 | 低（反爬严） | 高 | 不采用 |
| 易源数据 API | 商业免费层 | 全国 | 城市级 | 中 | 低 | 不采用（数据质量存疑） |
| 房天下 API | 商业 | 全国 | 小区级 | 中 | 中（100次/天免费） | 不采用 |
| akshare (Python) | 开源封装 | 全国 | 城市级 | 中 | 低（非 Node.js） | 不采用 |

### 2.2 数据源方案

**首期策略（2026-08 修订）：指数走东财接口 + 绝对价格/租金走中指官网，用户补充仅作精细化修正**

| 数据层 | 来源 | 内容 | 说明 |
|--------|------|------|------|
| **房价指数** | 东方财富 `RPT_ECONOMY_HOUSE_PRICE` | 70 城新建/二手住宅价格指数（环比/同比） | 免费、单接口全量、复用现有网关，Spike 已验证 |
| **绝对房价** | 中指研究院官网百城价格指数 | 100 城新建住宅**样本均价（元/㎡）** + 环比涨跌 | 官网 SSR 页面公开，月度更新，见 §2.7 |
| **租金数据** | 中指研究院官网 50 城租赁价格指数 | 50 城住宅平均租金（元/㎡·月）+ 环比/同比 | 自动获取优先，用户可手动修正 |
| **用户补充** | 手动录入 | 具体小区/区域的绝对价格 | 可选，仅当用户需要精确到区/小区级时使用 |

**为什么修订数据源方案**（相对 2026-04-30 初稿）：

1. 初稿假设"绝对价格和租金必须靠用户录入"——现中指官网免费公开百城均价和 50 城租金，首期即可展示真实租金收益率，无需用户动手
2. 初稿假设统计局 API 提供"环比/同比/定基"——实测定基指数 2023 年后已停发（东财接口中 `FIRST_COMHOUSE_BASE` 为 null），且统计局需三步调用
3. 东财接口与项目现有 eastmoney 适配器 + SourceGateway 天然集成，开发成本显著低于统计局适配器

#### 东方财富房价指数接口（首期主数据源）

- 基础 URL：`https://datacenter-web.eastmoney.com/api/data/v1/get`
- 报表名：`RPT_ECONOMY_HOUSE_PRICE`，无需鉴权
- 数据：月度环比/同比指数（新建商品住宅 + 二手住宅），**2011-01 至今共 13020 条（70 城 × 186 个月）**
- 更新频率：每月 15 日左右（与统计局发布同步）
- 覆盖范围：**70 个大中城市**
- 过滤方式：支持 `(CITY="北京")`、`(REPORT_DATE='2026-06-01 00:00:00')` 等 filter 参数
- 返回字段：`FIRST_COMHOUSE_SAME/SEQUENTIAL`（新建同比/环比）、`SECOND_HOUSE_SAME/SEQUENTIAL`（二手同比/环比）、`FIRST_COMHOUSE_BASE`（定基，**已停发为 null**）
- Spike 验证结果详见 §2.6

#### 国家统计局新版 API V2.0（备选）

- 基础 URL：`https://data.stats.gov.cn/dg/website/publicrelease/web/external`
- 无需鉴权，公开访问；数据与东财同源（东财亦转载统计局）
- 调用流程：
  1. `POST /new/queryIndexTreeAsync` — 获取分类树，定位"商品住宅销售价格指数"对应的 cid
  2. `POST /new/queryIndicatorsByCid` — 获取指标列表
  3. `POST /getEsDataByCidAndDt` — 获取具体数值
- **注意**：2023 年后发布物仅含环比/同比（定基列已取消），初稿中"定基指数"假设已失效
- 保留为备选的原因：数据源官方一手，可在东财失效时兜底

#### 租金数据策略

**自动获取（默认）**：
- 优先使用中指研究院官网 50 城租赁价格指数（绝对租金，元/㎡·月），见 §2.7
- 如不可用，使用内置的 70 城参考租金数据（随应用发布，基于公开统计数据）

**手动录入（补充）**：
- 用户在房价观察页可直接修改租金数值（区/小区级精细化）
- 手动数据优先级高于自动数据
- 存储在本地 `user_housing_data` 表中
- 在线模式下可同步到 Supabase

#### 房价数据（用户补充）

- 用户可在城市详情页手动输入关注的区域/小区房价（元/㎡）
- 用于区/小区级的精确租金收益率计算
- 完全可选——城市级均价已有自动来源，不输入时使用中指官网数据

### 2.3 数据获取架构

```
src/main/adapters/
├── housing/  (规划)
│   ├── contracts.ts              # HousingDataSource 接口（已加至 adapters/contracts.ts）
│   ├── nbsStatsAdapter.ts        # 国家统计局 API 适配器（备选，未实现）
│   └── localHousingData.ts       # 内置 70 城默认数据（首次离线启动用）
└── eastmoney/
    └── eastmoneyHousingDataSource.ts  # 东财 70 城指数适配器（Spike 已实现，见 §2.6）
```

遵循现有适配器模式。东财房价指数已通过 SourceGateway 注册（capability `housing.priceIndex`），自动获得限流/熔断/缓存（30 分钟 TTL）能力。租金与绝对房价数据在 `housingRepository` 层聚合（适配器 + 用户数据 + 内置数据优先级合并）。

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

1. **定基指数已停发**：2023 年后统计局/东财仅提供环比/同比，长期趋势需靠环比连乘重建（2020 年=100 的历史定基值仍可在早期数据中找到，或直接用同比做趋势展示）
2. **租金数据来源依赖网页解析**：中指官网为 SSR 页面（非 JSON API），需解析 HTML；如官网改版需更新解析器（备选：申请中指云商业 API）
3. **数据频率低**：房价指数为月度更新（每月 15 日发布上月数据），不是日级数据
4. **东财接口依赖第三方**：东财转载统计局数据，若接口变更需更新适配器（统计局 API 保留为兜底）
5. **城市覆盖固定**：70 城是统计局的固定清单，不包含所有地级市；中指百城覆盖更广（含百城均价）
6. **中指官网数据为"样本均价"**：百城价格指数的样本均价与真实成交均价存在口径差异，展示时需注明"样本均价"

---

### 2.6 Spike 验证记录（2026-08-03）：东财房价指数接口

**结论：数据可用，作为首期主数据源。**

#### 已验证事实

- 接口：`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_HOUSE_PRICE`
- 数据量：**13020 条 = 70 城 × 186 个月（2011-01 至今）**，更新至 2026-06，无需鉴权
- 字段：新建/二手住宅环比（`_SEQUENTIAL`）与同比（`_SAME`）均完整；定基（`_BASE`）为 null（确认停发）
- 过滤：`filter=(CITY="北京")` 返回单城全历史（186 条）；`filter=(REPORT_DATE='2026-06-01 00:00:00')` 返回当月全 70 城（70 条）；单次请求即可，无需分页
- 数据示例（2026-06）：北京新建同比 97.9（-2.1%）、二手环比 100.1（+0.1%）；上海新建同比 103.1（+3.1%）

#### 已落地代码

| 文件 | 内容 |
|------|------|
| `src/main/infrastructure/dataSources/types/sourceTypes.ts` | 新增 `housing.priceIndex` capability 及 `HousingPriceIndexInput/Output/Record` 类型 |
| `src/main/infrastructure/dataSources/registry/eastmoneyEndpoints.ts` | 注册 `eastmoney.housing.priceIndex` endpoint（支持 city/period/日期范围过滤） |
| `src/main/infrastructure/dataSources/router/capabilityRouter.ts` | 路由到 eastmoney |
| `src/main/infrastructure/dataSources/policy/policyEngine.ts` | 缓存策略：TTL 30 分钟 + stale 24 小时 |
| `src/main/adapters/contracts.ts` | `HousingDataSource` 接口：`getLatestSnapshot()` / `getCityHistory()` / `getRange()` |
| `src/main/adapters/eastmoney/eastmoneyHousingDataSource.ts` | 东财适配器实现 |
| `tests/main/adapters/eastmoneyHousingDataSource.integration.test.ts` | 8 个测试（4 单元 + 4 集成） |

#### 测试结果

- 新增测试全部通过（含真实接口集成测试）
- 全量 `npm test`：54 文件 314 测试通过；`npm run typecheck` 零错误

---

### 2.7 Spike 验证记录（2026-08-03）：中指研究院官网数据

**结论：数据可用。官网以 SSR JSON（`window.__INITIAL_STATE__`）内嵌方式提供绝对房价与租金，含 12 个月历史趋势。**

#### 已验证事实

- 页面：`https://www.cih-index.com/data/index/{newHouse|esfHouse|rentIndex}.html`
- 数据结构：页面内嵌 `window.__INITIAL_STATE__` JSON（SSR 渲染），无需登录、无验证码
- 三张表：

| 页面 | 覆盖 | 关键字段 | 最新数据（2026-07） |
|------|------|----------|---------------------|
| newHouse | 100 城新建住宅 | `average`（样本均价元/㎡）、`median`、`averageHuanBi/TongBi`（环比/同比） | 全国均价 17229 元/㎡ |
| esfHouse | 100 城二手住宅 | 同上 | 全国均价 12584 元/㎡ |
| rentIndex | 50 城租赁住宅 | `average`（元/㎡·月）、环比/同比 | 全国平均租金 34.01 元/㎡·月 |

- 每页均含：
  - `cityIndexInfo`：全量城市明细（100 或 50 条，含均价/租金 + 环比/同比 + 中位数）
  - `chartData`：**全国 12 个月历史趋势**（如 2025-08 至 2026-07）
  - `topInfo`：全国均值 + 涨跌榜首城市
- 数据示例（2026-07）：北京新建均价 47194 元/㎡、租金 82 元/㎡·月 → **租金收益率 ≈ 82×12/47194 ≈ 2.08%**

#### 关键价值

- **直接解决初稿"只做指数不做绝对价格"的痛点**：城市级绝对房价 + 绝对租金均可自动获取，用户手动录入降级为区/小区级精细化修正
- 租金收益率/租售比首期即可展示真实值（1.5%-3% 区间，与股票股息率直接对比）
- 与东财指数接口互补：东财管 70 城历史趋势（2011 至今），中指管 100 城绝对价格 + 50 城租金（最新 + 12 个月趋势）

#### 风险

- 数据为 SSR 页面内嵌，非正式 JSON API；官网改版可能变更结构，需定期验证（测试文件 `tests/main/adapters/cihIndexDataSource.integration.test.ts` 已固化 5 个断言）
- 百城价格为"样本均价"口径，与真实成交均价存在差异，UI 需注明
- 仅提供最近 12 个月趋势，更长历史需东财指数连乘或申请中指云商业 API

#### 验证代码

- `tests/main/infrastructure/cihIndexEndpoints.test.ts`：5 个解析单元测试（SSR 提取、快照解析、排序、异常、null 处理）
- `tests/main/adapters/cihIndexHousingDataSource.integration.test.ts`：5 个 gateway 链路集成测试（三页解析 + 环比/同比完整性 + 北京租金收益率推导验证），全部通过
- 全量 `npm test`（56 文件 324 测试）通过；`npm run typecheck` 零错误

#### 后续待办

- [x] 东财房价指数 Spike（§2.6）
- [x] 中指研究院绝对房价/租金验证（§2.7）
- [x] 中指页面解析适配器落地（`cihIndexEndpoints.ts` + `cihIndexHousingDataSource.ts`）
- [x] housingRepository 聚合层（自动数据 + 用户数据 + 内置数据优先级合并）
- [x] 领域服务：租金收益率/租售比计算（`housingCalculationService.ts`）
- [x] 房贷计算（`mortgageCalculationService.ts`：等额本息/等额本金）
- [x] 共享契约 + 用例层 + IPC 通道（`housing:*`）+ HTTP 路由
- [x] 前端页面：`HousingPage` / `HousingCityDetailPage` / `MortgageCalculatorPage` + 路由 + 导航
- [ ] Dashboard 集成房产收益卡片
- [ ] 跨资产对比页（Phase 2：散点图）

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
| 定价数据策略 | **指数趋势走东财接口（环比/同比）+ 绝对价格走中指官网百城均价**，用户可手动录入区/小区级数据以精确计算指标（2026-08 修订，替代初稿"只做指数"策略） |
| 城市范围 | **首期覆盖 70 城**（东财/统计局标准清单）；中指百城均价覆盖 100 城，作为补充 |
| 租金数据 | **自动获取优先（中指官网 50 城租赁指数），接受手动录入**。默认用自动数据，用户可覆盖修正。手动数据优先级 > 自动 > 内置 |
| 跨资产对比 UI | **散点图**（X 轴=风险/波动率，Y 轴=收益率），股票蓝点 + 房产橙点，同坐标系对比 |
| 数据存储与更新 | **跟现有机制一致**。本地 SQLite 缓存 + 30 天 TTL + 云端 Supabase 可同步。不重复拉取已有数据 |
| 暗色模式 | 暂不纳入规划 |

## 七、更新日志

- **2026-08-04**：Phase 1 完成。领域层（租金收益率/租售比/房贷计算）+ SQLite 三表 + 仓储聚合 + 共享契约 + 用例 + IPC/HTTP + 前端三页面（房价观察/城市详情/房贷计算器）全部落地，浏览器预览实测通过（北京 47194 元/㎡、租金收益率 2.09%、用户数据覆盖重算生效）。
- **2026-08-03**：复核修订。数据源首选改为东财接口（Spike 已验证，§2.6）；补充中指研究院官网绝对房价/租金方案（已验证，§2.7）；确认定基指数停发；统计局 API 降级为备选。
