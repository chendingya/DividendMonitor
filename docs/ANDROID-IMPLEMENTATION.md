# Android App 实现地图

本文档是 app 端（Android）实现的代码对照文档，按层组织：每节先讲机制，再给出对应代码位置。它与 `AGENTS.md`（L0 总纲）、`docs/README.md`（L1 索引）构成分层开发上下文，按需阅读。

分工：

- 构建命令、设备测试、验收记录 → `docs/ANDROID-BUILD.md`
- 移植路线与历史决策 → `docs/ANDROID-PORT-ASSESSMENT.md`
- 多资产/房产移动端验收细节 → `docs/ANDROID-MOBILE-ACCEPTANCE-2026-10-30.md`

路径均相对仓库根目录。文档与代码不一致时以代码为准，改动代码后请在同一次变更中同步本文档。

## 1. 总体结构

App 是项目的第四运行时：Capacitor 7 包装同一份 React 前端（`src/renderer`），WebView 内通过 `@main` 别名直接加载主进程业务代码（用例/仓储/适配器），没有 IPC，也不依赖电脑上的本地 HTTP 服务。

```
React UI → renderer service → desktopApi 运行时选择
  → inprocessRuntimeApi → @main/application 用例 → repositories
      → mobileNativeSqliteProvider → Capacitor SQLite → 原生 SQLite
      → nativeHttpTransport → CapacitorHttp → 原生网络（行情）
      → supabase-js（WebView fetch）→ Supabase 云端
```

| 目录/文件 | 职责 | 版本控制 |
| --- | --- | --- |
| `android/` | Capacitor Android 工程（Gradle、原生插件、instrumentation 测试） | 源码提交；`local.properties`、构建产物、`app/src/main/assets/public` 不提交 |
| `mobile/www/` | 移动端 Vite 构建输出 | 不提交（gitignore），`npm run build:mobile` 生成 |
| `capacitor.config.ts` | appId、webDir、edge-to-edge、SQLite 插件配置 | 提交 |
| `vite.config.mobile.ts` | 移动构建配置（CSP、env 注入、别名） | 提交 |
| `scripts/build-android.mjs` | JDK/SDK 探测 + Gradle 包装 | 提交 |

## 2. 启动链

`src/renderer/src/main.tsx:9` 在挂载 React 前调用 `initializeRuntime()`，成功后才 `ReactDOM.createRoot` 渲染；失败时把错误文本写入根节点。

顺序（选择器在 `src/renderer/src/services/`）：

1. `src/renderer/src/services/desktopApi.ts:13` `initializeRuntime()` — 仅进程内运行时执行，动态 import 懒加载依赖图；桌面/HTTP/mock 不加载 main 用例。
2. `src/renderer/src/services/nativeRuntime.ts:7` `initializeNativeRuntime()` — 先 `installMobileNativeSqliteProvider()`（含 schema 迁移），再 `setHttpGetTransport(createNativeHttpTransport())`。
3. 加载 `src/renderer/src/services/inprocessRuntimeApi.ts` 并缓存为运行时 API。

不变量：**数据库迁移完成前不挂载 React**；行情传输安装先于任何业务请求。

## 3. 运行时选择（四态）

`src/renderer/src/services/desktopApi.ts:8` `isInprocessRuntime()` = 无 `window.dividendMonitor` 且（Capacitor 原生环境 或 `?runtime=inprocess`）。`getRuntimeApi()`（同文件 :22）按以下顺序选择：

| 优先级 | 条件 | API |
| --- | --- | --- |
| 1 | `window.dividendMonitor` 存在 | preload IPC（Electron） |
| 2 | 进程内运行时 | `inprocessRuntimeApi` |
| 3 | `?runtime=mock` | `browserRuntimeApi`（localStorage 演示数据） |
| 4 | 其余浏览器 | `browserHttpRuntimeApi`（无头主进程 HTTP） |

`?runtime=inprocess` 只在原生壳内（或 mock 了原生插件的测试环境）有意义；浏览器不能靠该参数替代 Android 原生插件。

## 4. 进程内 API

`src/renderer/src/services/inprocessRuntimeApi.ts:69` 实现 `DividendMonitorApi` 契约（`shared/contracts/api.ts`），直接 import `src/main/application/useCases/` 的用例函数：

- 参数包装与 `browserHttpRuntimeApi` 保持一致（如 `createStockAssetQuery`）；DTO 直传，错误直接抛出，不走 HTTP 错误信封。
- `auth`/`sync` 走 `authService` / `subscribeAuthState` / `subscribeSyncStatus`（`src/main/infrastructure/supabase/`），进程内订阅，不经过 Electron 广播器。
- 桌面专属命名空间显式拒绝：`backup` 抛出「备份恢复仅桌面版支持」（:221）；`security.getLocalNonce` 返回固定值 `'inprocess'`（:251，进程内无服务端 nonce 机制）。

**新增 API 必须四处同步**：`shared/contracts/api.ts` 契约 → `src/main/ipc/channels/` → `src/main/http/routes/` → `inprocessRuntimeApi`（浏览器 fallback 按需补齐）。缺一处即断一个运行时。

## 5. 数据库层

### 共享边界

- `src/main/infrastructure/db/sqlite.ts` — `setDatabaseResolver`（:15）/ `initializeSchema`（:244）/ `getDatabase`（:282）；仓储只认 resolver，不感知平台。
- 迁移位于 `src/main/infrastructure/db/migrations/`，两端共用同一套。
- `src/main/infrastructure/db/serializedDatabase.ts:4` 把任意执行器包装为串行队列：所有读写异步等待；`transaction`（:19）独占队列直到提交/回滚，**回调内必须使用传入的执行器**，不要重入全局排队连接。

### Android 原生驱动

`src/main/infrastructure/db/mobileNativeSqliteProvider.ts`：

- `installMobileNativeSqliteProvider`（:57）经 `@capacitor-community/sqlite` 创建 `dividend-monitor` 连接（无加密），`beforeOpen()` 屏障后打开，跑迁移，注入 resolver；失败时调 `releaseConnection()` 清理并保留错误。
- `createNativeSqliteExecutor`（:28）把 Capacitor 结果适配为共享 `SqliteExecutor`：`BEGIN/COMMIT/ROLLBACK` 映射到插件事务方法；bigint 必须为安全整数；BLOB 转 number 数组。
- 设备上的数据库文件位于应用私有目录 `databases/dividend-monitorSQLite.db`。

桌面对照：`src/main/infrastructure/db/electronSqliteProvider.ts:30` 使用 Node 内建 `node:sqlite`（`DatabaseSync`），经 `src/main/infrastructure/db/nodeSqliteDatabase.ts` 包装为同一 `SqliteDatabase` 接口。

### Activity 生命周期插件

`android/app/src/main/java/com/chendingya/dividendmonitor/NativeDatabaseLifecyclePlugin.java`（`android/app/src/main/java/com/chendingya/dividendmonitor/MainActivity.java:9` 注册）：

- `beforeOpen`（:34）等待上一 Activity 的释放屏障（最长 30 秒）后才允许打开新连接。
- `handleOnDestroy`（:57）在**旧 Bridge 的插件线程**上回滚未提交事务并关闭连接，避免跨线程持有事务造成锁死。
- 清理错误保留日志并反馈到启动流程，不删除数据库文件、不吞错误。

性能教训：逐行跨 Capacitor 桥写入会形成长事务阻塞其他读取；价格缓存改为每 200 行批写、单批 600 参数（见 `docs/ANDROID-BUILD.md` 2026-10-29 记录）。批写须保持同一事务以保留完整回滚。

## 6. 网络层

- 注入点：`src/main/infrastructure/http/httpClient.ts:3-6` — `HttpGetTransport` 类型 + `setHttpGetTransport`；业务代码只用 `getJson` / `getText` / `getArrayBuffer`。
- Android 实现：`src/main/infrastructure/http/nativeHttpTransport.ts:6` `createNativeHttpTransport` 用 `CapacitorHttp.get` 在原生层发请求，绕开 WebView CORS；不全局改写 fetch。二进制响应 base64 解码为 ArrayBuffer；Capacitor 自动解析 JSON 而调用方要文本时重新 `JSON.stringify`；非 2xx 抛错。
- Supabase 请求走 WebView 自带 fetch（Supabase 服务端允许 CORS）；Electron 入口注入 `net.fetch` 复用系统代理，Android 保持默认。

## 7. 认证与云同步

- `src/main/infrastructure/supabase/supabaseClient.ts` — 会话存储默认 `browserSessionStorage`（localStorage，:9）；`setSessionStorage`（:24）/ `setSupabaseFetch`（:18）是平台注入点。
- Electron 入口 `src/main/index.ts:31` 安装加密文件存储（`src/main/infrastructure/supabase/sessionStorage.ts:138` `sessionFileStorage`，safeStorage 加密），:77 安装 `net.fetch`。**Android 保持默认**：会话存 WebView localStorage，网络走 fetch。
- 公开配置构建期注入：`vite.config.mobile.ts` 的 `define` 把 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 写入 bundle；禁止把 `service_role` 或服务端密钥放入移动构建。未配置时仍可用本地模式。
- 登录态监听：`inprocessRuntimeApi.auth.onAuthStateChange` 启动 `startAuthListener()` 后进程内订阅；同步状态经 `syncStatusNotifier` 广播。
- 邮件确认使用 Supabase 项目的 Site URL；Android 深链接自动回 App 未接入（见第 12 节限制）。

## 8. UI 适配

- 断点：`src/renderer/src/hooks/useIsMobile.ts:4` `MOBILE_BREAKPOINT_PX = 900`，与 `src/renderer/src/styles/theme.css` 的 `@media (max-width: 900px)` 保持一致；`resolveIsMobile` 为可单测纯函数。theme.css 另有 1200px / 720px 两级辅助断点。
- 导航：`src/renderer/src/layouts/AppShell.tsx:240` 判断窄屏；≤900px 隐藏侧边栏，顶栏出现汉堡按钮（:446），打开 antd `Drawer`（:513）；路由变化或离开窄屏自动收起。
- 移动样式：`src/renderer/src/styles/dashboardMobile.css`（AppShell 引入）、`src/renderer/src/styles/assetDetailMobile.css`（StockDetailPage 引入）、`src/renderer/src/components/housing/housingMobile.css`（HousingCityCards / HousingCityDetailPage 引入）。
- 首页主操作：搜索/录入持仓并排，次要操作收进 `<details>`「更多操作」（`src/renderer/src/components/dashboard/DashboardHero.tsx:44`）。
- 中文 locale：`src/renderer/src/App.tsx:31` antd `ConfigProvider locale={zhCN}`，日期面板为中文。
- 系统返回键：`src/renderer/src/components/app/NativeAppLifecycle.tsx:6` — 首页/登录页 `App.minimizeApp()` 转入后台，其余 `navigate(-1)` 或 replace 回首页。
- 系统栏：`capacitor.config.ts` `adjustMarginsForEdgeToEdge: 'auto'`（Android 15 edge-to-edge 边距）。
- 布局验收基线：手机首页无横向溢出、标题单行、主操作高度 ≥44px（`NativeUserJourneyTest` 的 `layout` 阶段）。

## 9. 功能门禁（app 不支持项）

| 功能 | 门禁位置 | 行为 |
| --- | --- | --- |
| 备份文件导入/导出 | `src/renderer/src/pages/SettingsPage.tsx:287-293` | 按钮 `disabled={isNativeRuntime()}` + 文案引导云同步 |
| 备份 API | `src/renderer/src/services/inprocessRuntimeApi.ts:221` | 抛「备份恢复仅桌面版支持」 |
| 图表 PNG/CSV 保存 | `src/renderer/src/utils/chartExport.ts:29-40` | 仍为 anchor download；WebView 无原生保存/系统分享（限制项） |

规则：新增桌面专属功能时，用 `isNativeRuntime()` 门禁、给出界面文案，并同步更新本文档与 `docs/ANDROID-BUILD.md` 的限制清单。

## 10. 构建管线

```
npm run build:mobile   # vite.config.mobile.ts → mobile/www
npm run android:sync   # build:mobile + cap sync android（复制资源进 android assets、更新插件清单）
npm run android:debug  # android:sync + scripts/build-android.mjs :app:assembleDebug
npm run android:test   # 同上但执行 :app:connectedDebugAndroidTest
```

- `vite.config.mobile.ts`：root 为 `src/renderer`，`base: './'`，`transformIndexHtml` 注入 CSP meta（`script-src 'self'`，`connect-src` 允许 `https://*.supabase.co`），别名含 `@main`（进程内加载业务代码的关键）。
- `capacitor.config.ts`：appId `com.chendingya.dividendmonitor`，appName 收息佬，webDir `mobile/www`，`allowMixedContent: false`，SQLite 无加密。
- `scripts/build-android.mjs`：JDK 优先 `ANDROID_JAVA_HOME` → `.runtime-data/tools/jdk21` → `JAVA_HOME`（要求 ≥21）；SDK 优先 `ANDROID_HOME` / `ANDROID_SDK_ROOT` → 平台默认路径；校验 Platform 35 完整；写 `android/local.properties`；调 `gradlew --no-daemon`。
- 产物 `android/app/build/outputs/apk/debug/app-debug.apk`（调试签名，非商店发布包）；最低 API 24、目标 API 35（`android/variables.gradle`）；仅 `INTERNET` 权限（`android/app/src/main/AndroidManifest.xml:40`）；声明 FileProvider。
- `mobile/www/` 与 `android/app/src/main/assets/public` 均被 gitignore；仓库提交的是源码与 Gradle 配置。

## 11. 测试映射

Vitest（与桌面共用，`npm test`）：

| 测试文件 | 覆盖 |
| --- | --- |
| `tests/main/infrastructure/db/mobileNativeSqliteProvider.test.ts` | 原生执行器适配、安装流程 |
| `tests/main/infrastructure/db/serializedDatabase.test.ts` | 串行队列、事务回滚 |
| `tests/main/infrastructure/http/nativeHttpTransport.test.ts` | 原生传输、二进制/文本回退 |
| `tests/renderer/services/desktopApi.test.ts` | 四态运行时选择 |
| `tests/renderer/services/inprocessRuntimeApi.test.ts` | 进程内 API 接线 |

Instrumentation（`android/app/src/androidTest/java/com/chendingya/dividendmonitor/`，`npm run android:test`）：

| 测试类 | 职责 |
| --- | --- |
| `NativeRuntimeTest` | 直接调业务 API：原生插件、分组持久化、Activity 销毁时未提交事务回滚 |
| `NativeUiFlowTest` | 操作打包后 WebView 的表单/导航/按钮，不导入业务 API |
| `NativeExtendedFlowTest` | ETF 搜索详情、买卖费用、日历面板宽度、房产录入触摸目标的扩展旅程 |
| `NativeUserJourneyTest` | 显式启用的完整界面旅程（register/login/restore/layout 等阶段，需专用测试账号） |

测试安装要求、阶段参数与历次验收记录见 `docs/ANDROID-BUILD.md`。

## 12. 当前限制

与 `docs/ANDROID-BUILD.md`「当前限制」保持一致：

- 备份文件导入/导出仅桌面支持；手机使用云同步。
- 图片/CSV 的原生保存与系统分享、商店签名发布、iOS 未实现。
- 邮件确认无深链接回 App，验证邮箱后需回到 App 登录。
- 模拟器已覆盖 Activity 重开、强制停止重启、真实账号云端推拉；真实手机的系统回收、断电及多设备同时编辑仍待验收。

## 13. 改动速查

改动 app 相关代码时按 `AGENTS.md`「双端同步开发规范」做分层验证。常见定位入口：

- 启动失败 → `src/renderer/src/main.tsx` / `src/renderer/src/services/nativeRuntime.ts` / `src/main/infrastructure/db/mobileNativeSqliteProvider.ts`
- 数据不持久化 / 事务阻塞 → `src/main/infrastructure/db/serializedDatabase.ts` / `android/app/src/main/java/com/chendingya/dividendmonitor/NativeDatabaseLifecyclePlugin.java`
- 行情请求失败 → `src/main/infrastructure/http/nativeHttpTransport.ts` / `src/main/infrastructure/http/httpClient.ts`
- 登录态丢失 → `src/main/infrastructure/supabase/supabaseClient.ts` 存储注入 / WebView localStorage
- 手机布局回归 → `src/renderer/src/hooks/useIsMobile.ts` 断点 / 对应 `*Mobile.css` / `NativeUserJourneyTest` layout 阶段