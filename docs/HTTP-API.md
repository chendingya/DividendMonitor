# 本地 HTTP API（headless 模式）

> 本文档描述无头主进程（headless runtime）提供的本地 HTTP API 的用途、启动方式、环境变量、认证机制与完整路由清单。
> 桌面模式（Electron IPC）不受本文档影响，接口契约见 `docs/IPC-CONTRACTS.md`。

## 1. 用途与适用场景

- 浏览器预览联调（`npm run dev:browser-preview`）
- 自动化测试与脚本化数据访问（同一台机器）
- 无 UI 环境下驱动主进程数据链路

桌面版与浏览器预览共享同一个主进程逻辑；HTTP API 是主进程能力的本地透出，**不是公网服务**，不应暴露到非本机网络。

## 2. 启动方式

### 方式一：浏览器预览（推荐）

```bash
npm run dev:browser-preview
```

等价于设置 `DIVIDEND_MONITOR_HEADLESS=1` 后运行 `electron-vite dev`，不创建应用窗口，仅启动主进程与本地 HTTP 服务。

### 方式二：手动无头启动

```powershell
$env:DIVIDEND_MONITOR_HEADLESS = '1'
npx electron-vite dev
```

## 3. 环境变量

| 变量 | 取值 | 默认 | 说明 |
|------|------|------|------|
| `DIVIDEND_MONITOR_HEADLESS` | `1` 启用无头 | 空（桌面模式） | 无头模式下不创建窗口 |
| `LOCAL_HTTP_API_PORT` | 端口号（纯数字） | `3210` | 覆盖 HTTP API 监听端口；未设置时使用 `http://127.0.0.1:3210` |

修改端口后访问基地址同步变化（如 `LOCAL_HTTP_API_PORT=3999` → `http://127.0.0.1:3999`）。渲染进程的前端基地址常量（`shared/contracts/api.ts` 中的 `LOCAL_HTTP_API_ORIGIN`）保持默认 `http://127.0.0.1:3210`，自定义端口主要用于脚本化联调。

## 4. 认证机制（X-Local-Nonce）

HTTP API 仅允许本机访问，部分敏感路由（auth 写入类）要求携带本地一次性 nonce：

1. 浏览器预览端通过 `GET /api/security/nonce` 获取 `{ "nonce": "<随机值>" }`；桌面端通过 IPC `security:getLocalNonce` 获取同一 nonce
2. 后续请求在 header 携带 `X-Local-Nonce: <nonce>`（示例见下）
3. nonce 由主进程在会话启动时生成（`src/main/security/localNonce.ts`），浏览器预览页的运行时（`browserHttpRuntimeApi.ts`）会自动获取并缓存 10 分钟，无需手工处理

示例（PowerShell）：

```powershell
$nonce = (Invoke-RestMethod 'http://127.0.0.1:3210/api/security/nonce').nonce
Invoke-RestMethod 'http://127.0.0.1:3210/api/auth/session' -Headers @{ 'X-Local-Nonce' = $nonce }
```

要求 `X-Local-Nonce` 的路由：`POST /api/auth/login`、`POST /api/auth/register`、`POST /api/auth/update-password`。不带或携带无效 nonce 时返回 `403`。

## 5. 完整路由清单

> DTO 类型定义见 `shared/contracts/api.ts`；路由实现见 `src/main/http/routes/`。所有请求体均为 JSON；`GET` 请求不读取请求体。

### 5.1 资产域（asset）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/asset/search` | body：`AssetSearchRequestDto`（含 `keyword` 等） | 搜索股票/ETF/基金/贵金属 |
| POST | `/api/asset/detail` | body：`{ assetKey }` 或 `{ code, assetType }` | 资产详情（含估值、股息率） |
| POST | `/api/asset/compare` | body：`{ items: [{ assetKey }] }` | 多资产对比 |

### 5.2 认证域（auth）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | body：`{ email, password }`；需 nonce | 登录，返回 `{ session }` |
| POST | `/api/auth/register` | body：`{ email, password }`；需 nonce | 注册，返回 `{ session, needsConfirmation }` |
| POST | `/api/auth/logout` | — | 登出（204） |
| GET | `/api/auth/session` | — | 当前会话 `{ session }` |
| POST | `/api/auth/update-password` | body：`{ newPassword }`；需 nonce | 修改密码，返回 `{ ok: true }` |
| GET | `/auth/callback` | — | Supabase 邮箱确认回调页（返回 HTML 页面，解析 URL hash 后调 `/api/auth/confirm`） |
| POST | `/api/auth/confirm` | body：`{ access_token, refresh_token? }` | 确认邮箱 token（回调页内部调用），返回 `{ ok: true }` |

### 5.3 计算域（calculation / backtest）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/calculation/historical-yield` | body：`AssetQueryDto` | 自然年历史股息率 |
| POST | `/api/calculation/estimate-future-yield` | body：`AssetQueryDto` | 未来股息率估算 |
| POST | `/api/calculation/backtest` | body：`AssetBacktestRequestDto` | 股息复投回测 |
| GET | `/api/backtest/history` | — | 回测历史列表 |
| POST | `/api/backtest/history` | body：`{ result, name?, dcaConfig? }` | 保存回测 |
| DELETE | `/api/backtest/history` | body：`{ id }` | 删除回测记录 |

### 5.4 分红域（dividend）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/dividend/history` | body：`DividendHistoryRequest`（筛选条件） | 分红历史（筛选） |
| GET | `/api/dividend/history` | — | 分红历史（全量） |
| GET / POST | `/api/dividend/upcoming` | — | 即将分红（已公告未派发） |
| GET / POST | `/api/dividend/forecast` | body（POST）：`{ year? }` | 分红预测 |

### 5.5 汇率域（fx）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/fx/usd-cny-rate` | — | 美元/人民币汇率，返回 `{ rate }`（数据源失败时返回默认值 7.2） |

### 5.6 行业域（industry）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/industry/analysis` | body：`{ industryName?, assetKeys? }` | 持仓行业分布分析 |
| GET | `/api/industry/distribution` | — | 行业分布数据 |
| POST | `/api/industry/benchmark` | body：`{ industryName }` | 行业基准对比 |

### 5.7 持仓域（portfolio）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/portfolio` | — | 持仓列表 |
| POST | `/api/portfolio/upsert` | body：`PortfolioPositionUpsertDto` | 新增/更新持仓（204） |
| POST | `/api/portfolio/remove` | body：`{ id }` | 按 id 移除持仓（204） |
| POST | `/api/portfolio/remove-by-asset` | body：`AssetQueryDto` | 按资产移除持仓（204） |
| POST | `/api/portfolio/replace-by-asset` | body：`PortfolioPositionReplaceByAssetDto` | 替换资产持仓（204） |
| POST | `/api/portfolio/risk-metrics` | body：`{ items: [{ assetKey, marketValue }] }` | 组合风险指标 |

### 5.8 安全域（security）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/security/nonce` | — | 获取本地 nonce，返回 `{ nonce }` |

### 5.9 设置域（settings）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/settings` | — | 读取设置 |
| PUT | `/api/settings` | body：`Record<string, unknown>` | 更新设置（部分字段） |
| DELETE | `/api/settings` | — | 重置所有设置为默认值 |

### 5.10 同步域（sync）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/sync/data` | body：`{ direction: 'push' | 'pull' | 'bidirectional' }` | 推送/拉取/双向同步 |
| GET | `/api/sync/status` | — | 同步状态 |

### 5.11 自选域（watchlist）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/watchlist` | — | 自选列表 |
| POST | `/api/watchlist/add-asset` | body：`WatchlistAddRequestDto` | 添加自选（204） |
| POST | `/api/watchlist/remove-asset` | body：`{ assetKey }` | 移除自选（204） |
| GET | `/api/watchlist/groups` | — | 分组列表 |
| POST | `/api/watchlist/groups` | body：`WatchlistGroupUpsertDto` | 新建分组（201） |
| PUT | `/api/watchlist/groups/:id` | body：`WatchlistGroupUpsertDto` | 更新分组 |
| DELETE | `/api/watchlist/groups/:id` | — | 删除分组（204） |
| POST | `/api/watchlist/groups/add-asset` | body：`{ groupId, assetKey }` | 加入分组（204） |
| POST | `/api/watchlist/groups/remove-asset` | body：`{ groupId, assetKey }` | 移出分组（204） |
| GET | `/api/watchlist/groups/:id/assets` | — | 分组内资产 |
| GET | `/api/watchlist/asset-groups/:key` | — | 资产所属分组（`assetKey` 需 URL 编码） |

## 6. CORS 与安全

- 仅允许同源与本地开发源（`http://127.0.0.1:<任意端口>`、`http://localhost:<任意端口>`）；非白名单 origin 时响应 `Access-Control-Allow-Origin` 固定为 `http://127.0.0.1:3210`，浏览器会阻止跨源读取
- 允许方法：`GET, POST, PUT, DELETE, OPTIONS`；允许请求头：`Content-Type, X-Local-Nonce`；`OPTIONS` 预检直接返回 204
- 响应附带安全头（CSP 等，见 `src/main/security/contentSecurityPolicy.ts`）：`Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`
- 本服务只绑定本机回环地址（127.0.0.1），切勿反向代理到公网

## 7. 公网部署方向

将本服务暴露到公网存在两个阻塞点，改造方向见 `docs/PACKAGING-AND-DEPLOYMENT.md`：

1. 前端 API 基址硬编码（需 `VITE_API_BASE_URL` 配置化）
2. HTTP 服务内嵌在 Electron 主进程中（需独立 Node 进程 + 真实鉴权）
