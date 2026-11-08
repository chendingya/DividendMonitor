# AGENTS.md

面向所有 AI 编码助手（Claude Code / Codex / OpenCode 等）与本仓库协作的指南。请先阅读本文件，再开始工作。

## 常用命令

```bash
npm run dev                  # 启动 Electron 桌面开发环境
npm run dev:browser-preview  # 浏览器预览模式（无头主进程 + 前端 dev server，端口自动退避）
npm run build                # 生产构建
npm run build:mobile         # Android WebView 资源构建
npm run android:debug        # 构建/同步资源并生成 Android 调试 APK（JDK 21 + SDK 35）
npm run android:test         # 已连接测试设备上的原生运行时测试
npm run dist:dir             # 构建目录产物（electron-builder --dir）
npm run dist:win             # 构建 Windows NSIS 安装包
npm run preview              # electron-vite 预览
npm run typecheck            # TypeScript 类型检查（tsc --noEmit）
npm test                     # 运行全部测试（vitest run，tests/ 107 个文件 630+ 测试）
npm run test:watch           # 监听模式运行测试
```

## 开发流程（Git 约定）

- **禁止直接在 main 上开发**：每个功能/修复/文档变更必须开分支（如 `feat/xxx`、`fix/xxx`、`docs/xxx`），自测通过后合并回 main 再推送。
- commit message 遵循 **conventional commits**（`feat|fix|docs|refactor|style|chore` + 中文描述，如 `fix(ui): 导出按钮与复权切换同排`）。
- commit 中**不要添加 `Co-Authored-By` 署名行**。
- 推送到 GitHub 偶发 502：等待 30–60 秒后重试，不要因此中断任务。
- 合并回 main 后推送 `origin/main`。

## 项目概述

收息佬（DividendMonitor）是面向 A 股/ETF/基金/贵金属长期投资者的收益分析工具，**Electron 桌面 + Android App 双端共用一份 React + TypeScript 代码库**。核心功能：多资产搜索、分红追踪、估值对比、自选分组管理、持仓管理、股息复投回测、分红统计中心、行业分析、股息率地图（全市场 TTM）、房产观察（70 城房价指数/租售比/房贷）、图表导出（PNG/CSV）、本地优先 + Supabase 在线模式（认证、云同步、备份恢复）。

## 技术栈

- **桌面框架**: Electron 35 + electron-vite 3
- **移动端**: Capacitor 7（`@capacitor-community/sqlite` 原生数据库 + `CapacitorHttp` 原生网络），Android 工程在 `android/`
- **前端**: React 18 + TypeScript 5.8 (strict) + Ant Design 5 + ECharts 5
- **路由**: HashRouter（兼容 Electron `file://` 协议）
- **数据存储**: SQLite，无 ORM；桌面用 Node 内建 `node:sqlite`，Android 用 Capacitor 原生 SQLite；迁移位于 `src/main/infrastructure/db/migrations/`，两端共用
- **在线模式**: Supabase（`@supabase/supabase-js`，认证 + 云端仓储），配置见 `.env`（`SUPABASE_URL` / `SUPABASE_ANON_KEY`）
- **测试**: Vitest（测试位于 `tests/`，107 个文件 630+ 测试）+ Android instrumentation 测试（`android/app/src/androidTest/`）
- **数据源**: 东方财富 / 腾讯 / 新浪免费接口 + 中指研究院（房产），通过统一网关（SourceGateway）调度
- **其他**: zod（DTO 校验）、electron-log（日志）

## 路径别名

| 别名 | 路径 |
|------|------|
| `@main/*` | `src/main/*` |
| `@preload/*` | `src/preload/*` |
| `@renderer/*` | `src/renderer/src/*` |
| `@shared/*` | `shared/*` |

TypeScript 编译、Vite 构建、Vitest 测试均已配置这些别名。跨进程 API 合约在 `shared/contracts/api.ts`（唯一共享源，IPC 与 HTTP 均基于它）。

## 架构总览

```
UI (renderer) → Hook → renderer service → runtime selector
  → Electron bridge → IPC → UseCase → Repository → Adapter → Infra
  → Android inprocessRuntimeApi → UseCase（WebView 内直载 @main）→ 原生 SQLite/HTTP
  → browser fallback (mock / HTTP API)
```

### 主进程分层（整洁架构风格）

```
src/main/
├── domain/           # 领域层 — 纯业务逻辑，不依赖 Electron/React
│   ├── entities/     #   实体定义（Stock、Settings 等）
│   └── services/     #   领域服务（估值、收益率、复投回测、风险指标、行业分析、贵金属换算、未来股息率、租金收益率/租售比、房价指数重建）
├── application/
│   ├── useCases/     #   用例编排（每个文件一个用例函数，共 50 个；Android 进程内运行时直接复用）
│   └── mappers/      #   DTO 转换（领域模型 ↔ API 合约）
├── repositories/     # 数据访问层（本地 SQLite + Supabase 云端仓储，repositoryFactory 按模式切换）
├── adapters/         # 外部数据源适配器（eastmoney / sina / danjuan / cihIndex，策略模式）
├── infrastructure/
│   ├── dataSources/  #   统一数据源网关（endpoint注册/路由/策略/限流/熔断/缓存/传输）
│   ├── cache/        #   内存与磁盘缓存（TTL、定时清理）
│   ├── db/           #   SQLite 初始化与迁移（migrations/）
│   ├── http/         #   HTTP 客户端（axios 封装）
│   ├── logging/      #   日志（electron-log）
│   ├── supabase/     #   Supabase 云同步客户端
│   └── config/       #   配置（缓存TTL、固定资产池等）
├── backup/           # 备份/恢复文件服务（backupFileService）
├── security/         # 内容安全策略（CSP）与 nonce 生成
├── ipc/channels/     # IPC 通道注册（asset/auth/backup/calculation/dividend/fx/housing/industry/portfolio/settings/stock/sync/watchlist/yieldMap）
└── http/routes/      # 本地 HTTP API（浏览器预览模式用，对应上述功能域，另含 security）
```

依赖方向严格单向：`domain → application → repositories/adapters → infrastructure`，禁止反向依赖。

### 渲染进程分层

```
src/renderer/src/
├── pages/            # 路由入口页面（Dashboard/StockDetail/AssetSearch/Watchlist/Comparison/Backtest/
│                     #   BacktestHistory/DividendCenter/IndustryAnalysis/YieldMap/UserCenter/Settings/Login/
│                     #   Housing/HousingCityDetail/MortgageCalculator）
├── components/       # 按功能域组织的业务组件和通用 UI 组件
│   ├── app/          #   通用/布局组件（AppCard、LedgerUi、ChartExportButton、PageState、AssetAvatar…）
│   ├── base/         #   基础 UI 组件
│   ├── dashboard/ stock-detail/ watchlist/ comparison/ backtest/ industry/ housing/
├── features/         # 功能域模块（backtest/comparison/stock-detail/stock-search/watchlist/yield-map）
├── contexts/         # React Context（AuthContext 等）
├── hooks/            # 自定义 hooks（封装异步请求、刷新、错误处理）
├── services/         # 渲染层运行时入口（desktopApi 运行时检测 + 各功能域 API）
├── router/           # 路由配置（AppRouter，含登录守卫）
├── layouts/          # 布局组件（AppShell：antd Menu 侧边导航）
├── store/            # 状态目录（空；状态管理走 hooks + local state，见 portfolioStore 于 services/）
├── types/  utils/    # 类型定义、工具函数（chartExport、format）
└── styles/           # 全局样式 + Ant Design token 定制
```

## 多运行时设计

项目支持四种运行模式，通过 `src/renderer/src/services/desktopApi.ts` 的运行时检测透明切换：

| 模式 | 触发条件 | 通信方式 | 数据持久化 |
|------|----------|----------|-----------|
| Electron 桌面 | 默认 | IPC (contextBridge) | SQLite |
| Android App | Capacitor 原生环境 | 进程内用例 + 原生 HTTP | Capacitor 原生 SQLite |
| 浏览器预览 | `?runtime=mock` | Mock 本地数据 | localStorage |
| 浏览器预览 | 默认 fallback | HTTP → 无头主进程 | SQLite (通过主进程) |

浏览器预览通过 `npm run dev:browser-preview` 启动，设置 `DIVIDEND_MONITOR_HEADLESS=1` 环境变量，主进程以无头模式运行 HTTP API（`http://127.0.0.1:3210`），前端 dev server 默认在 `http://127.0.0.1:8192`。dev 模式端口自动退避：8192/3210 被占用时依次退避到空闲端口，vite `/api` 同源代理跟随实际端口（生产打包版固定白名单，不退避）。

dev 模式下 SQLite 位于 `.runtime-data/db/dividend-monitor.sqlite`；安装版位于 `%APPDATA%\shou-xi-lao\db\`。

Android 不依赖本机 HTTP 服务；启动 React 前先完成原生数据库初始化。共享 SQL 边界是异步的，所有读写必须 await；`transaction` 回调内只使用传入的执行器（不要重入全局排队连接）。实现对照见 `docs/ANDROID-IMPLEMENTATION.md`，构建、设备测试及限制见 `docs/ANDROID-BUILD.md`。

## 双端同步开发规范

四个运行时共用一份代码库，**共享层改动默认同时影响桌面与 app**。任何改动先判断所属层，再按下表强制验证：

| 改动层 | 范围示例 | 必须验证 |
|--------|----------|----------|
| 共享业务层 | `src/main/domain`、`application`、`repositories`、`adapters`、`infrastructure`、`shared/contracts` | `npm run typecheck` + `npm test` + `npm run build:mobile` |
| 共享 UI 层 | `src/renderer` 页面/组件/hooks/样式 | 上述三项 + 检查 ≤900px 断点手机布局（`useIsMobile` / `*Mobile.css`） |
| 桌面壳层 | IPC 通道、preload、electron 配置、备份文件服务 | 桌面验证 + 确认 app 端无回归（进程内 API 是否受影响） |
| App 专属层 | 原生 SQLite/HTTP provider、`android/`、`capacitor.config.ts`、`vite.config.mobile.ts` | `npm run typecheck` + `npm test` + `npm run android:debug`（有设备时 `npm run android:test`） |

**改 Electron 专属功能前必须先确认 app 端对应行为**：

- app 应当支持 → 双端同步实现并验证，不允许只改桌面。
- app 无法支持 → 用 `isNativeRuntime()` 门禁 + 界面文案说明，并更新 `docs/ANDROID-IMPLEMENTATION.md` 与 `docs/ANDROID-BUILD.md` 的限制清单。

**新增/修改 API 四处同步清单**（缺一处即断一个运行时）：

1. `shared/contracts/api.ts` — 契约（唯一共享源）
2. `src/main/ipc/channels/` — Electron IPC
3. `src/main/http/routes/` — 浏览器预览 HTTP
4. `src/renderer/src/services/inprocessRuntimeApi.ts` — Android 进程内（浏览器 fallback `browserHttpRuntimeApi` / `browserRuntimeApi` 按需补齐）

**其他双端约束**：

- 数据库迁移（`src/main/infrastructure/db/migrations/`）两端共用，新迁移必须在原生 SQLite 上可执行；避免逐行跨桥写入，批量操作保持同一事务。
- 不在 renderer 写平台专属业务逻辑；平台差异收敛到 infrastructure 注入点（数据库 resolver、HTTP transport、会话存储）。
- 移动构建只注入公开配置（`SUPABASE_URL` / `SUPABASE_ANON_KEY`），禁止引入 `service_role` 或服务端密钥。
- 影响双端的 commit 在描述中注明两端影响面（如 `fix(portfolio): …（桌面+Android）`）。

## 在线模式（Supabase）

- 认证：`LoginPage` / `UserCenterPage`，会话状态由 `contexts/AuthContext` 管理；在线模式未登录时路由守卫重定向到 `/login`。
- 云同步：`syncChannels` / `syncRoutes` 提供推拉；本地仓储与 Supabase 仓储（`supabase*Repository`）通过 `repositoryFactory` 按模式切换。
- 环境变量：`SUPABASE_URL` / `SUPABASE_ANON_KEY`（见 `.env.example`），需真实项目凭据才能启用在线模式。

## 多资产统一架构

所有资产通过 `AssetIdentifierDto` (`assetType:market:code`) 统一标识：

```
STOCK:A_SHARE:600519   # 股票
ETF:A_SHARE:510300     # ETF
FUND:A_SHARE:160222    # 基金
```

`AssetProviderRegistry` + `AssetProvider` 接口组成插件化设计。每种资产类型实现自己的 Provider，声明 `capabilities` 表明支持哪些功能。前端通过统一的 `assetApi` 调用，后端根据 assetKey 路由到正确的 Provider。

## 关键设计约束

- **领域层纯净性**: `src/main/domain/` 中的代码不依赖 Electron、IPC、React 或任何 Node.js API，保证可独立单测
- **回测计算必须放在 main/domain**：前端只展示结果，不做核心计算
- **渲染进程不直接写 SQL 或直调第三方接口**：数据一律经用例→仓储→基础设施获取；桌面走 preload API，浏览器走 fallback，Android 进程内运行时在 WebView 中加载同一套 main 层代码，不另写一份业务逻辑
- **共享 UI 组件不依赖业务模块**：`components/app/` 中的组件只通过 props 渲染，不感知股票、分红等业务概念
- **DTO 流**: Repository 返回领域对象 → UseCase 返回 DTO → renderer service 生成 ViewModel → component 接收 ViewModel
- **无全局状态管理库**：状态通过 hooks + local state + API 调用管理
- **除权除息用因子法**：`avgCost × factor`，因子基于复权因子/参考收盘价计算（`adjustmentFactorService`），游标 `corporate_actions_applied_until` 控制增量应用
- **安全**: 渲染进程受 CSP 约束（`security/contentSecurityPolicy.ts`），动态脚本通过 nonce 注入（`localNonce`）
- **图表导出**: 导出通过 `utils/chartExport.ts` 的 Canvas 合成（标题条 + 图表截图），按钮组件 `ChartExportButton` 放在图表工具行（与复权切换同排），不悬浮于图表上方
- **房价指数走势**: 统计局定基指数停发，走势图用环比（上月=100）连乘重建（`housingCalculationService.ts` 的 `rebuildIndexSeries`），前端再按基准月归一为累计涨跌幅；统计计算必须在 main 侧完成

## 测试

- 全部 Vitest 测试在 `tests/`（107 个文件 630+ 个），覆盖领域服务、适配器、网关、仓储、迁移、安全、导出工具、渲染工具函数与运行时选择
- Android 相关单测：`tests/main/infrastructure/db/mobileNativeSqliteProvider.test.ts`、`serializedDatabase.test.ts`、`tests/main/infrastructure/http/nativeHttpTransport.test.ts`、`tests/renderer/services/desktopApi.test.ts`、`inprocessRuntimeApi.test.ts`
- Android instrumentation 测试在 `android/app/src/androidTest/`（`npm run android:test`），职责与测试安装要求见 `docs/ANDROID-BUILD.md`
- 修改领域/适配器/仓储/安全代码后运行 `npm test`；任何改动后运行 `npm run typecheck`；双端验证强度按「双端同步开发规范」分层执行

## 上下文路由（分层披露，按需阅读）

开发上下文分三层：**AGENTS.md（本文件，L0 总纲，必读）→ `docs/README.md`（L1 索引）→ 专项文档（L2，按任务读）→ 代码（L3，最终事实源）**。不要一次性通读全部文档；按下表路由到与当前任务相关的最小集合：

| 任务类型 | 先读 |
|----------|------|
| Android/app 端任何改动 | `docs/ANDROID-IMPLEMENTATION.md`（实现地图）→ `docs/ANDROID-BUILD.md`（构建与验收） |
| 新增/修改跨进程 API | `shared/contracts/api.ts` + `docs/IPC-CONTRACTS.md` + `docs/HTTP-API.md` |
| 数据源/行情接口 | `docs/DATA-SOURCE-GATEWAY-ARCHITECTURE.md` |
| 多资产扩展（ETF/基金/贵金属） | `docs/MULTI-ASSET-ARCHITECTURE.md` |
| 在线模式/认证/云同步 | `docs/ONLINE-ARCHITECTURE.md` |
| 打包发布（桌面/移动） | `docs/PACKAGING-AND-DEPLOYMENT.md` + `docs/ANDROID-BUILD.md` |
| UI 风格与交互 | `docs/UI-UX-DESIGN-PRINCIPLES.md` |
| 整体架构/分层 | `docs/ARCHITECTURE.md` + `docs/SDD.md` |
| 找其他文档 | `docs/README.md` 全量索引 |

文档滞后于代码时以代码为准，并在同一次变更中修正文档。
