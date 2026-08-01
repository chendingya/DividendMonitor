# 设计文档：三项技术债修复（HTTP API 文档 / 缓存层 / 页面状态组件）

- 日期：2026-08-01
- 范围：`docs/FRONTEND-IMPLEMENTATION-PLAN.md` §8 第 9/10/11 条
- 关联文档：`docs/PRD.md`、`docs/SDD.md`、`docs/PACKAGING-AND-DEPLOYMENT.md`、`docs/FRONTEND-IMPLEMENTATION-PLAN.md`

## 1. 背景与目标

| 条目 | 现状 | 目标 |
|------|------|------|
| 9. HTTP API 部署/启动说明不完善 | 端口硬编码 3210；无路由清单文档；环境变量与 nonce 认证机制无文档；`docs/README.md` 无索引 | 新建 `docs/HTTP-API.md` 完整文档 + 支持 `LOCAL_HTTP_API_PORT` 覆盖端口 |
| 10. SQLite 未扩展为完整缓存层 | 估值链路仅内存缓存（`Map`+`expiresAt` 手写 ×3 处）；估值无独立 SQLite 缓存表；`asset_snapshots`/`price_cache` 已有 SQLite 先例 | 通用 `TimedCache` 类替换 3 处手写缓存；估值结果新增 `valuation_cache` SQLite 表（务实小步，不改造 SourceGateway） |
| 11. 通用页面状态组件可再抽取 | 9 个页面各自写 Skeleton/Alert/Empty 三段式；12 个 hooks 中 10 个重复 `useState+useEffect+try/catch/finally` 样板 | 新建 `useFetch` hook + `PageState` 三态组件，迁移全部调用点，对外 API 不变 |

## 2. §1 HTTP API 文档 + 端口可配置

### 2.1 代码改动

仅改 `src/main/http/server.ts`：

1. 新增 `resolveLocalHttpOrigin()`：优先读 `process.env.LOCAL_HTTP_API_PORT`，未设置则回退解析 `LOCAL_HTTP_API_ORIGIN`（`shared/contracts/api.ts`，默认 3210）
2. CORS 白名单基于实际解析出的 origin 生成（当前基于常量）
3. 启动日志输出实际监听地址

`shared/contracts/api.ts` 常量保持默认不动（渲染进程基址不变；端口自定义属 headless 联调场景，文档中说明）。

### 2.2 文档交付

新建 `docs/HTTP-API.md`：

1. 概述：headless 模式用途、适用场景（浏览器预览联调、自动化测试）
2. 启动方式：`npm run dev:browser-preview`；手动 `DIVIDEND_MONITOR_HEADLESS=1` + `electron-vite dev`
3. 环境变量表：`DIVIDEND_MONITOR_HEADLESS`、`LOCAL_HTTP_API_PORT`
4. 认证机制：`X-Local-Nonce` 流程（`GET /api/security/nonce` → 注入 `<meta>` → 请求头携带；哪些路由要求该头）
5. 完整路由清单：11 个路由文件全部端点（方法、路径、参数、响应概要）
6. 公网部署方向：引用 `PACKAGING-AND-DEPLOYMENT.md` 阻塞点说明
7. 更新 `docs/README.md` 索引；勾掉 `FRONTEND-IMPLEMENTATION-PLAN.md` §8 第 1 条

## 3. §2 缓存层务实小步

### 3.1 `TimedCache` 通用类（新建 `src/main/infrastructure/cache/timedCache.ts`）

```ts
export class TimedCache<K, V> {
  constructor(private readonly ttlMs: number) {}
  getFresh(key: K): { value: V } | undefined  // 未过期才返回；返回包裹对象以区分"未命中"与"缓存了 undefined"
  set(key: K, value: V): void
  delete(key: K): void
  clear(): void
  get size(): number
}
```

内部惰性清理：读写时跳过过期条目，不主动定时清理。

替换 3 处手写缓存：

| 位置 | TTL | 备注 |
|------|-----|------|
| `valuationRepository.ts` | 15min | 成功才写缓存 |
| `indexValuationRepository.ts` | 15min | 成功才写缓存 |
| `indexCodeResolver.ts` | 24h | 会缓存 undefined 结果（依赖 `{value}` 包裹语义）；`clearIndexCodeCache()` 转调 `cache.clear()` |

### 3.2 `ValuationCacheRepository`（新建 `src/main/repositories/valuationCacheRepository.ts`）

新表（加入 `src/main/infrastructure/db/sqlite.ts` 的 `createBaseSchema`，与 `portfolio_risk_snapshots` 同构）：

```sql
CREATE TABLE IF NOT EXISTS valuation_cache (
  cache_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_valuation_cache_fetched_at ON valuation_cache(fetched_at DESC);
```

API：

```ts
export class ValuationCacheRepository {
  upsert(cacheKey: string, dataJson: string): void
  findByKey(cacheKey: string): { cacheKey: string; dataJson: string; fetchedAt: string } | undefined
  findFreshByKey<T>(cacheKey: string, ttlMs: number): T | undefined  // JSON 解析异常静默返回 undefined
}
```

TTL 由调用方传入（股票/指数估值均 15min）。

### 3.3 仓库改造

**`ValuationRepository`**（缓存键：symbol）：

```
getStockValuation(symbol):
  1. memoryCache.getFresh(symbol) 命中 → 返回
  2. diskCache.findFreshByKey(symbol, 15min) 命中 → 回填内存 → 返回
  3. 拉取（Promise.all PE/PB，现状不变）
  4. 成功 → 写内存 + 写 SQLite；失败 → 不写（避免缓存失败态）
  SQLite 读写异常 → catch 后静默走拉取（缓存层不阻断主流程）
```

**`IndexValuationRepository`**（缓存键：indexCode）：同构改造。

**`indexCodeResolver`**：仅换 `TimedCache`，不落盘（非估值结果，TTL 24h）。

## 4. §3 页面状态组件

### 4.1 `useFetch` hook（新建 `src/renderer/src/hooks/useFetch.ts`）

```ts
export function useFetch<T>(fetcher: () => Promise<T>, deps: DependencyList): {
  data: T | null
  loading: boolean        // 首载 true；reload 时置 true
  error: string | null    // Error → message
  reload: () => Promise<void>   // rethrow（与 useWatchlist 现状一致，调用方行为不变）
  setData: Dispatch<SetStateAction<T | null>>
}
```

- mountedRef 防泄漏；error 复位逻辑与现状一致
- 迁移 10 个 hooks：`useSettings / useAssetDetail / useStockDetail / useAssetComparison / useComparison / useAssetBacktest / useBacktest / useIndustryAnalysis / useWatchlist / useWatchlistGroups` — 逐一核对 fetcher 签名与 deps，替换样板；**对外 API 完全不变**（含 mutation 状态如 `mutatingAssetKey`、`saving`）
- **不迁移**（特殊模式，强行抽象收益低）：`usePortfolio`（双数据源 + 大量派生计算 + 自有 refreshing 语义）、`usePortfolioRiskMetrics`（条件早退 + lastKeyRef 防重复请求 + loading 初始 false）、`useIndustryBenchmark`（无三态的小 hook）
- `reload` 语义：默认 rethrow（与 useWatchlist 现状一致）；`useSettings` 传 `{ rethrow: false }` 保持其不抛错现状
- `useStockDetail` 不清理（按用户选择，仅迁移样板）

### 4.2 `PageState` 三态组件（新建 `src/renderer/src/components/app/PageState.tsx`）

```tsx
<PageState loading error={error} empty={!data || data.length === 0}
           skeletonRows={6} emptyTitle emptyDescription errorTitle="加载失败">
  {children}
</PageState>
```

- loading → `<Skeleton active paragraph={{rows: skeletonRows}} />`
- error → `<Alert type="error" showIcon message={errorTitle} description={error} />`
- empty → 复用现有 `PageStateBlock` 渲染（保持视觉风格）
- 正常 → `children`
- `PageStateBlock` 保留（局部空态场景继续使用）

迁移 7 个页面：`WatchlistPage / StockDetailPage / ComparisonPage / BacktestPage / BacktestHistoryPage / IndustryAnalysisPage / SettingsPage` 页面级三段式替换为 `PageState` wrapper（整页内容由数据决定，适合 wrapper）。

**不迁移**（搜索框/工具栏常驻、仅结果区有状态，属局部三态，wrapper 会吞掉常驻布局）：`AssetSearchPage`、`DividendCenterPage`；二者已使用 `PageStateBlock`/`Empty`/`Spin`，保持现状。`BacktestHistoryPage` 与 `SettingsPage` 的三态外已有 `.ledger-page` 包装，迁移时保留外层 div。

## 5. 测试策略

- `TimedCache`：单测（`tests/main/infrastructure/timedCache.test.ts`，`vi.useFakeTimers`）
- `ValuationCacheRepository`：单测（`tests/main/repositories/valuationCacheRepository.test.ts`，参照 `assetSnapshotRepository.test.ts` 的 `vi.mock('@main/infrastructure/db/sqlite')` + `DatabaseSync(':memory:')` 模式）
- `ValuationRepository`：单测（`tests/main/repositories/valuationRepository.test.ts`，mock dataSource + mock ValuationCacheRepository：首次拉取写两层 / 内存命中零请求 / SQLite 命中零请求 / 失败不写缓存）
- `useFetch`/`PageState`：项目 vitest 为 node 环境无 jsdom、renderer 测试均为纯函数测试 → **不新增 React 渲染测试依赖**，靠 typecheck + 端到端浏览器验收
- 迁移后全量 `npm test` 无回归

## 6. 端到端验证（MCP 实际验收，必做）

除单测 + `npm run typecheck` 外，每项功能必须用浏览器 MCP（chrome-devtools 工具）对实际运行的应用做端到端验收：

### 6.1 HTTP API（HTTP + 浏览器双通道）

| # | 验证动作 | 通过标准 |
|---|---------|---------|
| 1 | 启动 `dev:browser-preview`，请求 `GET http://127.0.0.1:3210/api/security/nonce` | 返回 nonce |
| 2 | 设置 `LOCAL_HTTP_API_PORT=3999` 启动，请求 3999 | 端口生效、3210 不受影响 |
| 3 | 获取 nonce → 带 `X-Local-Nonce` 头请求 `/api/auth/session` | 通过；不带头 → 拒绝 |
| 4 | 抽查 3-5 个代表性端点（`/api/asset/search`、`/api/dividend/upcoming`、`/api/watchlist`、`/api/settings`） | 与文档路由清单一致 |
| 5 | 浏览器打开前端页面 | 正常加载、无控制台错误 |

### 6.2 缓存层（浏览器 + SQLite 验证）

| # | 验证动作 | 通过标准 |
|---|---------|---------|
| 1 | 浏览器搜索"贵州茅台"进详情页 | 估值正常显示 |
| 2 | 检查 SQLite `valuation_cache` 表 | 有该股票估值行 |
| 3 | 刷新页面再进详情页，观察网络面板 | 估值请求不发（命中缓存） |
| 4 | 重启应用（清内存缓存场景）再进详情页 | 估值仍显示且无新网络请求（SQLite 恢复） |

### 6.3 页面状态（浏览器）

| # | 验证动作 | 通过标准 |
|---|---------|---------|
| 1 | 遍历 9 个页面 | 正常态渲染无回归 |
| 2 | 构造错误态（断网/mock 失败） | 统一 error Alert，无白屏 |
| 3 | 构造空态（空自选/空回测历史） | 统一空态组件 |
| 4 | 慢网速（Fast 3G 模拟） | Skeleton 加载态 |

### 6.4 最终验收门槛

`npm run typecheck` ✓ + `npm test` ✓ + 6.1/6.2/6.3 全部 MCP 端到端项 ✓

## 7. 非目标（明确不做）

- 公网部署改造（`VITE_API_BASE_URL` 配置化、HTTP 服务从主进程解耦）— 仅文档指引
- SourceGateway RequestCache 升级为 SQLite 持久化 — 本次务实小步不做
- `indexCodeResolver` 落盘 — TTL 24h 非估值结果，不做
- `useStockDetail` 与 `useAssetDetail` 合并清理
- `usePortfolio` / `usePortfolioRiskMetrics` / `useIndustryBenchmark` 迁移
- `AssetSearchPage` / `DividendCenterPage` 局部三态迁移（搜索框常驻场景）
- 新增 React 渲染测试基础设施（jsdom/@testing-library）
