# 自选数据库化与双端一致化执行方案

## 1. 背景

当前项目已经完成了收益追踪、自选、对比、回测的前端主链路拼装，但核心持久化与运行时适配仍存在两个明显问题：

1. 自选数据当前使用单个 JSON 文件持久化，桌面端已出现 `EPERM` 写入失败。
2. 渲染层当前默认依赖 Electron preload 注入的 `window.dividendMonitor`，导致浏览器预览环境无法执行同一套业务链路。

这两个问题共同说明：当前实现还停留在“先跑通链路”的过渡态，没有真正落到 `SDD` 约定的正式架构。

## 2. 目标

本轮目标不是继续修补 JSON 文件，而是把项目拉回到文档定义的正确方向：

1. 用 SQLite 替代 JSON 文件作为正式本地存储层。
2. 将自选、自定义设置等用户状态迁移到数据库表。
3. 在渲染层建立统一服务接口，让 Electron 桌面端与 Web 预览端共享同一套页面逻辑。
4. 保持 `renderer -> service -> bridge/adapter -> use case/repository` 的分层边界，不把数据库或 Node 能力泄漏到渲染层。

## 3. 范围

### 3.1 本轮必须完成

1. 建立 SQLite 基础设施入口。
2. 建立最小数据库 schema，至少包含：
   - `watchlist_items`
   - `app_settings`
3. 用数据库仓库替换当前 `watchlistRepository` 的 JSON 实现。
4. 保持现有 `watchlist:list/add/remove` IPC 契约不变，避免前端调用层重构过大。
5. 为渲染层引入运行时适配入口：
   - Electron 端使用 preload bridge
   - Web 端使用 browser fallback adapter
6. 让浏览器预览至少能跑通自选的增删查和基础联调。

### 3.2 本轮可顺带完成

1. 修掉 `antd` 的 `Card bordered` 废弃警告。
2. 补一个统一的开发态数据目录说明。
3. 为数据库 schema 增加初始化日志与错误提示。

### 3.3 本轮不做

1. 全量行情缓存表落地。
2. 回测结果缓存入库。
3. 云同步、多端账户体系。
4. 全量 ORM 接入。

## 4. 设计原则

1. **先最小闭环，再扩表**：先让 `watchlist_items` 稳定工作，再扩展到更多缓存表。
2. **接口不轻易变**：优先保持现有 `watchlistApi`、`useWatchlist`、页面调用方式不变。
3. **渲染层不碰数据库**：数据库读写只允许发生在 main 进程。
4. **双端一致靠 adapter，不靠条件分支散落页面**：页面只认统一 service 接口。
5. **浏览器预览可退化，但不能失效**：Web 端允许用 fallback storage，但必须可联调。

## 5. 分阶段执行

## Phase 1：数据库替换自选存储

### 目标

解决当前 `watchlist:add` 的桌面端持久化失败，让桌面端自选正式切到 SQLite。

### 任务

1. 建立 SQLite 基础连接模块。
2. 建立 `src/main/infrastructure/db`。
3. 初始化 `watchlist_items` 与 `app_settings` 表。
4. 将 `watchlistRepository` 改为数据库实现。
5. 保持现有 use case 和 IPC 接口可继续调用。
6. 删除 JSON 文件写入路径与相关逻辑。

### 验收

1. Electron 桌面端可成功加入自选。
2. Electron 桌面端可重启后保留自选。
3. 不再出现 `watchlist.json` 的写入错误。

## Phase 2：渲染层双运行时适配

### 目标

让浏览器预览与 Electron 桌面端共享同一套页面逻辑，只切换适配器实现。

### 任务

1. 为 `stockApi`、`watchlistApi`、`calculationApi` 抽象统一运行时入口。
2. Electron 端继续使用 preload bridge。
3. Web 端提供 browser fallback adapter：
   - 自选使用浏览器本地存储
   - 数据查询可直接复用 HTTP 数据源或退化为 mock/fallback
4. `desktopApi.ts` 改为运行时选择器，而不是强制要求 bridge 存在。

### 验收

1. 浏览器预览环境不再因缺少 `window.dividendMonitor` 直接报错。
2. 自选页、对比页、详情页在浏览器预览能完成基础联调。
3. 页面与 hooks 不新增 Electron/Web 双分支散落代码。

## Phase 3：扩展数据库为正式缓存层

### 目标

把 SQLite 从“只存自选”扩展到“正式本地缓存层”。

### 任务

1. 增加 `stocks`、`quote_snapshots`、`financial_metrics` 等表。
2. 建立“先查本地缓存，再回源”的数据访问路径。
3. 为缓存增加更新时间与过期策略。

### 验收

1. 数据源波动时页面可使用本地缓存降级。
2. 主路径响应速度明显提升。
3. 本地缓存层与远端适配层边界清晰。

## 6. 当前执行顺序

本次提交按以下顺序推进：

1. 先补本方案文档。
2. 立即执行 `Phase 1`。
3. `Phase 1` 稳定后进入 `Phase 2`。

## 6.1 当前状态回填

截至本轮实现：

1. 方案文档已创建。
2. `Phase 1` 已开始并已完成以下内容：
   - 新增 SQLite 基础设施入口。
   - 新增 `watchlist_items`、`app_settings` 的最小 schema。
   - `WatchlistRepository` 已从 JSON 文件切换为 SQLite 实现。
   - 开发态 `userData` 已切换到项目内 `.runtime-data`，避免开发环境继续写系统 Roaming 目录。
   - 已完成 `typecheck`，并已验证 SQLite 文件可在 `.runtime-data/db` 下成功创建与读写。
   - 当前 SQLite 实现依赖 Node 内建 `node:sqlite`，不是 `package.json` 中显式安装的第三方依赖。
3. `Phase 1` 待继续验证项：
   - Electron 桌面端实际点击加入/移除自选。
   - 确认数据库文件与自选数据可重启保留。
4. `Phase 2` 已开始并已完成以下内容：
   - `desktopApi.ts` 已改为运行时选择器。
   - 已新增 `browserRuntimeApi.ts` 作为 Web 预览 fallback。
   - 浏览器预览已实测跑通搜索、自选、批量进入对比的最小联调链路。
5. `Phase 2` 待继续推进项：
   - 把浏览器 fallback 从内置 mock 进一步替换为更接近真实远端数据源的实现。
   - 统一桌面端与浏览器端的错误提示和能力边界说明。

## 7. 风险

1. 当前实现使用 Node 内建 `node:sqlite`，并未在 `package.json` 中显式安装第三方 SQLite 包，团队可见性不足。
2. 若后续切换到原生第三方 SQLite 依赖，Windows/Electron 可能存在安装或 ABI 问题。
3. 若直接选用重量 ORM，会拖慢当前修复节奏。
4. 浏览器端若没有 fallback data source，仍只能验证壳层。

## 8. 风险应对

1. 先记录当前 `node:sqlite` 方案的真实状态，不在文档中误写为“已安装 SQLite 依赖”。
2. 先用最小封装，不急着引入复杂 ORM。
3. 先保证 `watchlist` 在 Web 端可联调，再逐步补足其他能力。
4. 后续单独评估是否切换为显式第三方 SQLite 包。

## 9. 本轮完成定义

当满足以下条件时，视为本轮完成：

1. 方案文档已落仓。
2. Electron 桌面端的自选功能已切到 SQLite 并可正常使用。
3. `watchlist:add/remove/list` 的主链路已通过类型检查与本地验证。
4. 文档状态已回填，下一阶段目标清晰可继续执行。
