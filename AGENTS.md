# AGENTS.md

面向所有 AI 编码助手（Claude Code / Codex / OpenCode 等）与本仓库协作的指南。请先阅读本文件，再开始工作。

## 常用命令

```bash
npm run dev                  # 启动 Electron 桌面开发环境
npm run dev:browser-preview  # 浏览器预览模式（无头主进程 + 前端 dev server，端口自动退避）
npm run build                # 生产构建
npm run dist:dir             # 构建目录产物（electron-builder --dir）
npm run dist:win             # 构建 Windows NSIS 安装包
npm run preview              # electron-vite 预览
npm run typecheck            # TypeScript 类型检查（tsc --noEmit）
npm test                     # 运行全部测试（vitest run，tests/ 420+ 测试）
npm run test:watch           # 监听模式运行测试
```

## 开发流程（Git 约定）

- **禁止直接在 main 上开发**：每个功能/修复/文档变更必须开分支（如 `feat/xxx`、`fix/xxx`、`docs/xxx`），自测通过后合并回 main 再推送。
- commit message 遵循 **conventional commits**（`feat|fix|docs|refactor|style|chore` + 中文描述，如 `fix(ui): 导出按钮与复权切换同排`）。
- commit 中**不要添加 `Co-Authored-By` 署名行**。
- 推送到 GitHub 偶发 502：等待 30–60 秒后重试，不要因此中断任务。
- 合并回 main 后推送 `origin/main`。

## 项目概述

收息佬（DividendMonitor）是一个 Electron + React + TypeScript 桌面应用，面向 A 股/ETF/基金/贵金属的长期投资者的收益分析工具。核心功能：多资产搜索、分红追踪、估值对比、自选分组管理、持仓管理、股息复投回测、分红统计中心、行业分析、股息率地图（全市场 TTM）、房产观察（70 城房价指数/租售比/房贷）、图表导出（PNG/CSV）、本地优先 + Supabase 在线模式（认证、云同步、备份恢复）。

## 技术栈

- **桌面框架**: Electron 35 + electron-vite 3
- **前端**: React 18 + TypeScript 5.8 (strict) + Ant Design 5 + ECharts 5
- **路由**: HashRouter（兼容 Electron `file://` 协议）
- **数据存储**: SQLite（Node 内建 `node:sqlite`，无 ORM），迁移位于 `src/main/infrastructure/db/migrations/`
- **在线模式**: Supabase（`@supabase/supabase-js`，认证 + 云端仓储），配置见 `.env`（`SUPABASE_URL` / `SUPABASE_ANON_KEY`）
- **测试**: Vitest（测试位于 `tests/`，70 个文件 420+ 测试）
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
  → browser fallback (mock / HTTP API)
```

### 主进程分层（整洁架构风格）

```
src/main/
├── domain/           # 领域层 — 纯业务逻辑，不依赖 Electron/React
│   ├── entities/     #   实体定义（Stock、Settings 等）
│   └── services/     #   领域服务（估值、收益率、复投回测、风险指标、行业分析、贵金属换算、未来股息率、租金收益率/租售比、房价指数重建）
├── application/
│   ├── useCases/     #   用例编排（每个文件一个用例函数，共 48 个）
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

## 双运行时设计

项目支持三种运行模式，通过 `src/renderer/src/services/desktopApi.ts` 的运行时检测透明切换：

| 模式 | 触发条件 | 通信方式 | 数据持久化 |
|------|----------|----------|-----------|
| Electron 桌面 | 默认 | IPC (contextBridge) | SQLite |
| 浏览器预览 | `?runtime=mock` | Mock 本地数据 | localStorage |
| 浏览器预览 | 默认 fallback | HTTP → 无头主进程 | SQLite (通过主进程) |

浏览器预览通过 `npm run dev:browser-preview` 启动，设置 `DIVIDEND_MONITOR_HEADLESS=1` 环境变量，主进程以无头模式运行 HTTP API（`http://127.0.0.1:3210`），前端 dev server 默认在 `http://127.0.0.1:8192`。dev 模式端口自动退避：8192/3210 被占用时依次退避到空闲端口，vite `/api` 同源代理跟随实际端口（生产打包版固定白名单，不退避）。

dev 模式下 SQLite 位于 `.runtime-data/db/dividend-monitor.sqlite`；安装版位于 `%APPDATA%\shou-xi-lao\db\`。

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
- **渲染进程不直接访问数据库或第三方接口**：所有数据通过 preload API / browser fallback 获取
- **共享 UI 组件不依赖业务模块**：`components/app/` 中的组件只通过 props 渲染，不感知股票、分红等业务概念
- **DTO 流**: Repository 返回领域对象 → UseCase 返回 DTO → renderer service 生成 ViewModel → component 接收 ViewModel
- **无全局状态管理库**：状态通过 hooks + local state + API 调用管理
- **除权除息用因子法**：`avgCost × factor`，因子基于复权因子/参考收盘价计算（`adjustmentFactorService`），游标 `corporate_actions_applied_until` 控制增量应用
- **安全**: 渲染进程受 CSP 约束（`security/contentSecurityPolicy.ts`），动态脚本通过 nonce 注入（`localNonce`）
- **图表导出**: 导出通过 `utils/chartExport.ts` 的 Canvas 合成（标题条 + 图表截图），按钮组件 `ChartExportButton` 放在图表工具行（与复权切换同排），不悬浮于图表上方
- **房价指数走势**: 统计局定基指数停发，走势图用环比（上月=100）连乘重建（`housingCalculationService.ts` 的 `rebuildIndexSeries`），前端再按基准月归一为累计涨跌幅；统计计算必须在 main 侧完成

## 测试

- 全部测试在 `tests/`（65 个文件 370+ 个），覆盖领域服务、适配器、网关、仓储、迁移、安全、导出工具与渲染工具函数
- 修改领域/适配器/仓储/安全代码后运行 `npm test`；任何改动后运行 `npm run typecheck`

## 详细文档

见 `docs/README.md` 索引（架构、多资产、数据源网关、在线版、IPC 契约、HTTP API、UI 设计原则等）。
