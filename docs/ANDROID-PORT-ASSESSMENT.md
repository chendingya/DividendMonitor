# Android 移植技术评估（Assessment）

> 状态更新（2026-09-20）：P0 已合并；P1 与原生驱动阶段合并实现，Android 工程使用 Capacitor SQLite/HTTP。构建方法及当前限制以 `ANDROID-BUILD.md` 为准。以下保留 2026-09-04 的评估事实与路线历史，不代表当前文件数量或验收结果。
> 日期：2026-09-04
> 范围：将收息佬（DividendMonitor）从 Electron 桌面单端扩展为 Android 移动端的技术路线评估

---

## 1. 结论摘要

**推荐路线：Capacitor 打包现有 React 渲染层 + 主进程 TS 后端以"进程内运行时"跑进 Android WebView。**

理由一句话版：本仓库的分层架构（`desktopApi.ts` 运行时选择器、领域层纯净、合约单一来源 `shared/contracts/api.ts`）天然支持再加一个运行时；真正挡路的 Node 内建 API 依赖面极窄（`node:sqlite` 仅 8 个文件、`node:fs` 仅 4 个），Electron 依赖全部集中在壳层。**不需要重写，复用率估算：渲染层 100%、领域层/用例层 100%、仓储层 ~90%（换驱动）、数据源适配层 ~95%（换传输）。**

分五个阶段（P0–P4），每阶段独立交付、独立验收、可随时止损。P0（移动响应式基础）零 Capacitor 依赖、桌面零回归风险，先行实施。

---

## 2. 现状审计（代码事实）

以下数据全部来自 2026-09-04 对当前 main 分支的扫描，文件引用可直接定位。

### 2.1 运行时架构：已有三态选择器

`src/renderer/src/services/desktopApi.ts` 按 `window.dividendMonitor` 是否存在做三态选择：Electron IPC → `?runtime=mock` 本地假数据 → HTTP 回退（无头主进程）。**新增第四态（进程内/Capacitor）是该设计的自然延伸，合约面 `shared/contracts/api.ts` 原样复用。**

### 2.2 Node 内建 API 依赖面（移植的主要障碍）

| 模块 | 文件数 | 具体位置 | 移植难度 |
|------|--------|----------|----------|
| `node:sqlite` | 8 | `src/main/infrastructure/db/sqlite.ts`、`infrastructure/db/migrations/` 下 6 个迁移、`infrastructure/dataSources/cache/sqliteRequestCacheStore.ts` | 中：需驱动抽象（见 §4.3） |
| `node:fs` | 4 | `sqlite.ts`（建目录）、`infrastructure/supabase/sessionStorage.ts`（token 落盘）、`backup/backupFileService.ts`、`ipc/channels/backupChannels.ts` | 低：换 Capacitor Filesystem / localStorage |
| `node:crypto` | 3 | `security/localNonce.ts`、`repositories/watchlistGroupRepository.ts`、`repositories/backtestResultRepository.ts` | 极低：`randomUUID` → Web `crypto.randomUUID()` |
| `node:http(s)/events` | 1 | `infrastructure/http/httpClient.ts`（keep-alive agent） | 低：浏览器构建下条件剔除 |

15 个仓储文件引用 `db/sqlite`，但都通过 `repositories/repositoryFactory.ts` 切换，**接口不动，只加驱动实现**。

### 2.3 Electron 依赖面：全部在壳层

`src/main` 中共 21 个文件直接 import electron：`index.ts`（1）+ `ipc/channels/`（16 个通道注册）+ `infrastructure/supabase/`（3：authService/sessionStorage/syncStatusNotifier）。**domain/application/repositories/adapters 四层零 Electron 依赖**，符合 AGENTS.md 的分层约束，可直接被浏览器目标打包。

### 2.4 前端响应式现状（P0 的直接输入）

`src/renderer/src/styles/theme.css`（2162 行）已有响应式基础，但存在一个**致命缺口**：

- ✅ 已具备：viewport meta（`src/renderer/index.html:5`）；5 个媒体查询断点（1200/900/720px）；卡片网格单列化（≤1200px）；表格列宽调整（≤900px）；内边距收缩（≤720px）
- ❌ **致命缺口：`theme.css:1290` 的 `@media (max-width: 900px)` 把 `.ledger-sidebar` 直接 `display: none`，没有任何替代导航——窄屏下用户无法切换页面**
- ❌ 缺口：无触控导航、数据行在 <720px 无横向兜底、无安全区（刘海/手势条）适配、ECharts tooltip 为 hover 触发、桌面交互密度未调
- 硬宽度清单：`.app-topbar-search` 320px（`theme.css:143`）、`.ledger-sidebar` 192px（`theme.css:419`）、`.ledger-topbar-search-wrap` max-width 420px（`theme.css:738`）

布局骨架集中在 `layouts/AppShell.tsx`（侧边栏 + 顶栏 + 面包屑三段式）+ `theme.css` 单文件，49 个页面/组件几乎没有硬编码宽度。**改 2 个文件即可完成框架级适配（L1）。**

### 2.5 构建与测试基建

- 构建：electron-vite（main/preload/renderer 三段配置），renderer 端口 8192、`/api` 代理 → 3210；路径别名 `@main/@preload/@renderer/@shared` 全端可用
- 测试：Vitest，`environment: 'node'`，`tests/{main,renderer,shared}/` 三分类，`tests/renderer/` 已有纯函数测试先例（无 DOM 测试设施——组件验证走 typecheck + 浏览器预览）
- 依赖：react 18.3 / antd 5.27 / echarts 5.6 / axios / zod / supabase-js 2.105，无 Capacitor 相关依赖

---

## 3. 技术路线对比与决策

| 路线 | 结论 | 关键原因 |
|------|------|----------|
| **Capacitor + 进程内后端** | ✅ 采用 | 渲染层与后端分层全量复用；WebView 即运行时；插件生态覆盖 SQLite/HTTP/存储/分享 |
| React Native | ❌ | AntD 5 与 ECharts 均为 DOM 体系，49 个 tsx 全部作废，等于重写 |
| nodejs-mobile（真跑 Node） | ❌ | 项目停留在 Node 18；本仓库 `node:sqlite` 要求 Node ≥22.5，死路 |
| 纯 PWA（仅在线模式） | ⚠️ 仅作过渡 | 丢掉"本地优先"核心卖点；无真本地 SQLite；不满足目标 |

## 4. 关键改造点设计

### 4.1 第四运行时（进程内）— P1 核心

`desktopApi.ts` 增加分支：`?runtime=inprocess` 或检测 `window.Capacitor` 时，返回直接调用 UseCase 的 API 实现（import 自 `@main/application/...`，由浏览器构建目标打包）。这一步在浏览器预览里即可完整验证，是整个移植的地基，且对桌面端零破坏。

### 4.2 构建目标拆分 — P2

新增 `vite.config.mobile.ts`（浏览器模式、`base: './'`，复用 renderer 的别名与代理配置），产物输出 `mobile/www/`，供 Capacitor 打包。桌面 electron-vite 构建不动。

### 4.3 SQLite 驱动抽象 — P1/P2

`infrastructure/db/sqlite.ts` 重构为驱动接口（`query/run/exec/transaction` 级别的薄接口）+ 两个实现：桌面 `node:sqlite`、移动 `@capacitor-community/sqlite`。6 个迁移的 SQL 语句可复用，需一个跑在驱动接口上的迁移 runner。**待确认：现行迁移的版本记录方式（PRAGMA user_version 还是 journal 表），P1 动手时确认。**

### 4.4 HTTP 传输替换 — P2

WebView 内直连东方财富/腾讯/新浪会被 CORS 拦截（桌面在 Node 进程调所以无感）。网关传输层只有 `transport/httpTransport.ts` 一个实现（axios），旁边加 Capacitor 传输实现（CapacitorHttp 原生请求，无 CORS 限制）。GBK 解码用 `TextDecoder('gbk')`，Chromium WebView 原生支持。

### 4.5 Supabase 在线模式 — P2

supabase-js 本身是浏览器库，几乎原样可用；`sessionStorage.ts` 的 fs 存储换 SecureStorage/localStorage 适配器；邮箱验证/重置密码回调改 App Link deep link。

### 4.6 UI 三级适配策略 — P0/P3

- **L1 框架级（P0）**：抽屉导航补齐致命缺口、安全区、表格横向兜底。只动 `AppShell.tsx` + `theme.css` + 新增 hook
- **L2 页面级（P3）**：仅高频路径（投资组合/股票详情/自选/分红统计）做卡片化重排；回测、房贷计算器保持 L1 兜底。DTO 流（service → ViewModel → component）保证重排只改 tsx/CSS 不动取数逻辑
- **L3 兜底（大概率不用）**：若 AntD 5 在真机上仍笨重，移动端组件层换 Ant Design Mobile。L1 真机验证前不考虑

## 5. 风险登记

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | WebView CORS 拦截全部第三方数据接口 | 高（数据全断） | CapacitorHttp 原生传输（§4.4），传输层是单一替换点 |
| R2 | `node:sqlite` 与 capacitor-sqlite 行为差异（事务/类型） | 中 | 驱动接口薄化 + 仓储层测试在两驱动上跑同套用例 |
| R3 | 数据源对移动 UA 风控/限流 | 中 | CapacitorHttp 伪装桌面 UA；网关已有熔断与多源降级 |
| R4 | AntD 5 移动端密度与交互（hover 态、Modal、DatePicker） | 中 | L1/L2/L3 分级策略；触控目标 ≥44px；`triggerOn: 'click'` |
| R5 | 回测等长计算阻塞 WebView UI 线程 | 中 | domain 层纯净无 Node API，天然可进 Web Worker |
| R6 | Supabase 邮箱回调 deep link 配置 | 低 | App Links + fallback URL |
| R7 | 双端维护成本 | 中 | 合约/领域/仓储单仓库单一来源；CI 同时跑 typecheck+test 作为双端闸门 |
| R8 | Android WebView 版本碎片 | 低 | TextDecoder('gbk') 需 Chromium 62+（2017），覆盖无忧 |

## 6. 分阶段路线图

| 阶段 | 名称 | 范围 | 验收标准 | 估算 |
|------|------|------|----------|------|
| **P0** | 移动响应式基础 | 抽屉导航、安全区、720px 兜底 | ≤900px 有完整导航；桌面 1920px 零回归；浏览器预览 390px 可用 | ~1 天 |
| **P1** | 进程内运行时 + 驱动抽象 | `?runtime=inprocess`；SQLite 驱动接口（node:sqlite + 内存实现）；fs 依赖收窄 | 浏览器预览 inprocess 模式下自选/持仓读写全通；`npm test` 全绿 | 2–3 天 |
| **P2** | Capacitor 壳接入 | cap add android；capacitor-sqlite 驱动 + 迁移 runner；CapacitorHttp 传输；会话存储；APK 真机 | 真机安装后本地数据全功能（搜索/自选/持仓/分红/地图） | 3–5 天 |
| **P3** | 高频页面移动重排 | 4 个高频页卡片化；ECharts 触控；导出走系统分享 | 真机上手感成立；重排页 ViewModel 零改动 | 3–5 天 |
| **P4** | 发布与分发 | 签名、GitHub Actions Android job、更新检查、国内 APK 分发；iOS 同工程二期 | CI 出签名 APK；官网可下载 | 1–2 天 |

每阶段结束都是可发布的增量：P0/P1 纯桌面仓库改进（即使移植中止也不白做）；P2 起才引入 Capacitor 工程文件。

## 7. 成本估算

全职投入约 2–3 周；兼职约 4–6 周。最贵的是 P2（原生插件联调）与 P3（页面重排的手感迭代）。

## 8. 待确认问题（不阻塞 P0）

1. 现行迁移 runner 的版本记录机制（P1 确认）
2. 中指研究院房产接口在移动网络环境下的可达性与 UA 策略
3. Android 系统返回键 ↔ 路由集成（Capacitor App plugin + `navigate(-1)`，P2 处理）
4. 移动包内 Supabase anon key 分发（anon key 本身是公开级别，风险可接受，但需在隐私政策中声明）
5. minSdk 目标（建议 24+，跟随 Capacitor 7 默认）

## 9. 配套执行计划

- P0 已产出完整可执行计划：`docs/superpowers/plans/2026-09-04-android-mobile-responsive-foundation.md`（按 superpowers writing-plans 规范编写，任务级代码与验收步骤齐全）
- P1–P4 计划在各自启动时编写（P1 依赖 §8.1 的确认结果；每阶段先 brainstorm 再写计划）
