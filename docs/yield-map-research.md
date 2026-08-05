# 股息率地图（yield-map）预调研

> 状态：调研完成，**2026-08-03 Alex 已确认方案 A（全市场）**；功能已于 2026-08-05 实现并合入 main（验收见 `docs/yield-map-acceptance.md`）
> 日期：2026-08-03
> 关联文档：`docs/PRD.md` §8.2 / §9.7 / Phase 2、`docs/FRONTEND-IMPLEMENTATION-PLAN.md` §7

## 1. 需求背景

PRD §9.7 股息率地图：

- 以**热力或矩形树图（Treemap）**方式展示股票股息率分布
- 支持按**行业、板块、自选分组**等维度展示
- 支持**颜色映射和图例**
- 支持**点击地图项**进入股票详情或比较视图

用户动机（PRD §5-5 / L89）：通过股息率地图快速发现全市场或自选范围内的高股息标的分布，避免逐只搜索。

当前状态：`yield-map` 路由、组件、API 均未实现；`src/renderer/src/store/` 外无任何相关代码。

## 2. 现状基础（可复用）

| 能力 | 现状 | 复用点 |
|------|------|--------|
| 行业分析 | `getIndustryAnalysis.ts` 聚合自选+持仓（上限 100 只）按行业分组，前端 Table + Pie | 聚合函数 `aggregateByIndustry`/`rankInIndustry`（`domain/services/industryAnalysisService.ts`），但依赖逐只 `AssetDetailSource`，全市场场景需轻量化改造 |
| 行业字段 | F10 `sshy`（`eastmoneyStockProfileEndpoint`）与 push2 `f100` 均为**东财行业分类**，口径一致 | 全市场可直接用 clist 的 `f100` |
| Endpoint 模式 | `EndpointDefinition`（buildUrl/mapResponse）+ 注册表（`eastmoneyEndpoints.ts`）+ SourceGateway（限流/熔断/缓存/降级） | 新增分页批量 endpoint 走既有模式（同 housing `eastmoneyHousingPriceIndexEndpoint` 先例） |
| 分红数据 | `eastmoneyStockDividendEndpoint` 已用 `RPT_SHAREBONUS_DET`（单代码过滤） | 去掉 filter 即为全市场数据源 |
| 可视化 | ECharts 5 已接入（K 线/柱状/折线），无 Treemap 先例 | treemap 为 ECharts 内置 series，无新依赖 |
| 状态组件 | `PageState` 三态 + `useFetch` | 页面直接套用 |

## 3. 数据源实测（2026-08-03）

### 3.1 全市场分红事件 — `RPT_SHAREBONUS_DET` ✅ 可用

```
GET https://datacenter-web.eastmoney.com/api/data/v1/get
    ?reportName=RPT_SHAREBONUS_DET&columns=ALL
    &pageNumber=1&pageSize=500&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1
    &source=WEB&client=WEB
```

- **总量 56,378 条**（全市场历史分红事件），pageSize 上限 500 → **113 页**
- 关键字段（实测）：
  - `SECURITY_CODE` / `SECURITY_NAME_ABBR`：代码/名称
  - `DIVIDENT_RATIO`：该次分红的**股息率**（每股派息/价格，实测 002611 = 0.0121）
  - `PRETAX_BONUS_RMB`：每 10 股派现金
  - `EX_DIVIDEND_DATE` / `PLAN_NOTICE_DATE` / `ASSIGN_PROGRESS`：除权日/公告日/进度
  - `IMPL_PLAN_PROFILE`：方案文本；`TOTAL_SHARES`、`BASIC_EPS`、`BVPS`
- 无需鉴权、无 filter 即可分页拉全量（与项目现有 `eastmoneyStockDividendEndpoint` 同源）
- 备注：按除权日降序首屏即含"已公告未除权"事件（与"即将到账"数据同源，可顺带复用）

### 3.2 全市场行情 + 行业 — clist ✅ 可用

```
GET https://push2.eastmoney.com/api/qt/clist/get
    ?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12
    &fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048   (沪深京 A 股)
    &fields=f12,f13,f14,f2,f100
    (需带 Referer: https://quote.eastmoney.com/)
```

- **全市场 5,888 只 A 股**；单次最多返回 **100 条** → **59 页**
- 字段：`f12` 代码、`f13` 市场、`f14` 名称、`f2` 最新价、`f100` 行业（约 50+ 东财行业分类，实测含"化学制品/通信设备/半导体/银行"等）
- `f168/f169/f170` 等非股息率（实测为主力资金数据），**clist 无现成股息率字段**

### 3.3 其他候选接口

| 接口 | 结论 |
|------|------|
| `RPT_DIVIDEND_HIS`（datacenter） | ❌ 实测无有效返回 |
| `RPT_VALUEANALYSIS_DET` 无 filter | ❌ 需按代码过滤，不适用全市场 |
| push2 单股 `stock/get` 扩展字段 | ❌ 实测 f168 等为资金数据，无股息率 |

**结论：全市场股息率需用「分红事件聚合 + 最新价」自行计算，接口层面无单请求直出。**

## 4. 方案设计（建议稿）

### 4.1 整体数据流

```
[桌面主进程]
  clist 全市场行情+行业（59 页，并行 10）     → 全市场股票基础表（内存）
  RPT_SHAREBONUS_DET 全市场分红（113 页，并行 10） → 分红事件表（内存）
        ↓ 聚合（domain 纯函数）
  股票级：assetKey / 名称 / 行业 / 最新价 / TTM股息率（近12个月∑每股派息 ÷ 最新价）
  行业级：行业中位数股息率 / 行业均值 / 样本数
        ↓
  SQLite 快照表 yield_map_snapshots（本地持久化，TTL 由 fetch 策略控制）
        ↓ 在线模式上传
  Supabase industry_yield_snapshots（行业级聚合，供多设备/云端回放）
        ↓
[renderer] ECharts treemap：行业层 → 股票层 drill-down
```

### 4.2 股息率口径（关键决策）

- **TTM 口径**：`∑(近 12 个月除权事件的每股派息) ÷ 最新收盘价`——与详情页年度股息率/未来股息率估算服务同一思想，可比性强
- 无分红记录 → 不进入地图（或归入"未分红"灰色类目，可配）
- 银行股等每年多次分红（中期+年度）自动累加，DIVIDENT_RATIO 仅作参考不做主口径
- 备选口径：最近一次除权事件的 DIVIDENT_RATIO（实现最简单，但跨期不可比，不推荐）

### 4.3 存储设计

本地 SQLite（新增迁移）：

```sql
CREATE TABLE yield_map_snapshots (
  asset_key       TEXT PRIMARY KEY,
  symbol          TEXT NOT NULL,
  name            TEXT NOT NULL,
  industry        TEXT NOT NULL,
  price           REAL,
  yield_ttm       REAL NOT NULL,          -- 0 表示无分红
  total_dps_12m   REAL,                   -- 近12个月每股累计派息
  fetched_at      TEXT NOT NULL
);
```

Supabase（新增表，PRD §8.2-1 原名 `industry_yield_snapshots`）：

```sql
create table public.industry_yield_snapshots (
  industry      text not null,
  snapshot_date date not null,
  median_yield  real not null,
  avg_yield     real not null,
  stock_count   integer not null,
  primary key (industry, snapshot_date)
);
```

- 云端是否存**股票级**数据（约 5,888 行/快照）vs 仅行业级（约 60 行）→ 待定，建议先行业级（体量小、满足地图主视图）
- 云端填充方式待定（见 §6 开放问题 5）

### 4.4 前端

- 页面 `/yield-map`（`YieldMapPage`），套 `PageState` + `useFetch`
- 主视图：ECharts `treemap` series
  - 一级：行业（块大小 = 行业样本数或总市值，颜色 = 行业中位数股息率）
  - 二级：股票（点击行业块 drill-down 或 flat 全市场）
  - 颜色映射：`visualMap` 分段（低股息 灰蓝 → 高股息 红），图例随 visualMap
- 维度切换：行业 / 自选分组（复用 `useWatchlistGroups`）/ 板块（TBD）
- 点击股票块 → 跳转详情页；右键/按钮 → 加入对比
- 刷新按钮：桌面端触发主进程重新抓取聚合；在线模式读云端快照（可设"同步云端"按钮）

### 4.5 链路

- `shared/contracts/api.ts` 新增 `yieldMap` 命名空间：`getMarketYieldMap()` / `refreshMarketYieldMap()`（含 DTO：行业级+股票级）
- IPC `yieldMapChannels.ts`（`yield-map:get` / `yield-map:refresh`）+ HTTP routes（`POST /api/yield-map/...`）+ preload + renderer runtime（desktop/browserHttp/mock）——按既有 dividend 命名空间模式复制
- 浏览器预览 mock：内置固定样例数据（演示用）

### 4.6 抓取执行策略

- 59 + 113 页 ≈ 172 请求；并行 10、每页 500ms 估算 → **~10 秒** 首抓（桌面模式一次性可接受）
- 走 SourceGateway：注册两个新 endpoint（`eastmoney.market.clist`、`eastmoney.market.dividend`），自动获得限流/熔断/重试
- 快照缓存：本地表 TTL（建议 24h），页面打开优先读缓存，超时才重抓
- 失败降级：单页失败跳过（partial result），聚合结果标注 `partial: true`

## 5. 备选方案（范围缩减）

| 方案 | 说明 | 适用 |
|------|------|------|
| A. 全市场（推荐） | 上述完整方案，5,888 只 + 行业 drill-down | 默认 |
| B. 关注池先行 | 仅自选+持仓+自选分组维度（复用现有 `getIndustryAnalysis` 扩容到 1,000 只），不做全市场 | 想先快速上线地图交互，数据量小（无需 Supabase） |
| C. 东财条件选股接口 | 用东财"条件选股"股息率排行（未验证 reportName），字段受控 | 若 A 的聚合口径不被认可再评估 |

建议：**A 为主方案，B 作为 A 的降级/渐进路径**（先 B 验证交互，再切 A 全量数据）。

## 6. 风险与开放问题

1. **口径一致性**：TTM 股息率与详情页年度股息率（自然年）口径不同，需在 UI 注明"近 12 个月口径"；与 `estimateFutureYield`（预案口径）的关系待定义
2. **抓取稳定性**：172 请求对东财限流敏感，需在 SourceGateway 配慢启动/重试；`clist` 需 Referer header（现有 HTTP 客户端已支持 headers）
3. **行业分类漂移**：clist `f100` 与 F10 `sshy` 均为东财行业，但个别股票两接口值可能不同（F10 是主营行业，clist 是所属板块）——实测 002611 两者一致，需抽样验证；分类口径以哪边为准待定
4. **数据量**：股票级快照 5,888 行/天 ≈ 1MB（SQLite 无压力；Supabase 若存股票级需按日分区策略）
5. **云端填充职责**：在线模式下由谁抓取？
   - 桌面端抓取后上传（实现快，但云端只有"最近上传者"的数据）
   - Supabase Edge Function 定时抓取（云端自治，但 Edge Function 出网到东财稳定性未知 + 需部署函数）
   - 建议：先桌面端上传（Phase 1），Edge Function 作为 Phase 2 可选
6. **刷新频率**：股息率随股价变动，建议日级刷新（快照 fetched_at 标注）；分红事件仅除权日更新时变化
7. **UI 规模**：5,888 个 treemap 节点性能（echarts 可承受，但建议行业级默认 + 点击展开股票级，避免首屏卡顿）

## 7. 建议实施步骤（供后续计划文档引用）

1. Phase 0：domain 纯函数 `buildYieldMap(events, quotes)` + 聚合口径单测（含多笔分红累加、无分红、行业分组）
2. Phase 1：两个新 endpoint（clist 分页 / RPT_SHAREBONUS_DET 分页）+ SourceGateway 注册 + 限流策略
3. Phase 2：SQLite `yield_map_snapshots` 迁移 + repository + `getMarketYieldMap` useCase + IPC/HTTP/preload/runtime 链路
4. Phase 3：前端 `YieldMapPage`（treemap + visualMap + 维度切换 + 详情/对比跳转）+ mock
5. Phase 4：Supabase `industry_yield_snapshots` 建表 + 上传/读取（在线模式）
6. Phase 5（可选）：Edge Function 定时抓取云端自治

### 7.1 迁移实施记录

- **2026-08-05**：Supabase 迁移 `create_industry_yield_snapshots`（版本 20260805003819）已执行，Phase 4 云端建表完成
- **表结构**（`industry_yield_snapshots`）：`industry` text、`snapshot_date` date、`median_yield` float4、`avg_yield` float4、`stock_count` int4、`fetched_at` timestamptz（default now()）；`id` uuid 主键，`user_id` 外键 → `auth.users(id)` ON DELETE CASCADE；唯一约束 `unique(user_id, industry, snapshot_date)`
- **RLS policy**：4 个 policy 全部为 own 语义（select / insert / update / delete 均以 `auth.uid() = user_id` 限定）
- **advisors 复查**：仅既有 `auth_leaked_password_protection` WARN（auth 层面的泄漏密码保护未开启，与本迁移无关），无新增安全/性能告警

## 8. 结论

全市场股息率地图**数据源可行**（东财两个免费接口实测可用，无需新第三方），主要工作量在聚合口径定义、172 请求的抓取调度与快照存储，前端 treemap 无技术风险。建议按 §7 分 5-6 个 Phase 渐进实施，先本地后云端。
