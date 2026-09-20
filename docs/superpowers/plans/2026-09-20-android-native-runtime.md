# Android 原生运行时实施计划

> 执行方式：使用 subagent-driven-development 分配后端异步迁移子任务；主执行者并行完成不共享文件的 Android 工程与原生适配器。每个子任务验证并审查后集成。

**Goal:** 构建可安装的 Android 调试 APK，使用 Capacitor 原生 SQLite 与原生 HTTP 运行现有 React 和业务用例。

**Architecture:** 保持 shared/contracts/api.ts 合约、main/domain 计算和仓储 SQL。数据库边界支持异步执行，桌面 Node SQLite 与 Capacitor SQLite 共享迁移和仓储。移动端通过 inprocessRuntimeApi 调用；独立 Vite mobile 构建和 Android 工程提供原生壳。

**Spec:** docs/ANDROID-PORT-ASSESSMENT.md；Alex 于 2026-09-20 要求继续移动 App，并质疑浏览器 SQLite，已承诺回归原生 App 路线。

## 约束与裁决

- 撤回本次尚未提交的 JSON/WASM/IndexedDB 试验，不交付浏览器 SQLite。
- P1 原计划假设在线仓储不使用 SQLite，经代码审查和无 Node 复现证伪。P1 收尾与 P2 原生驱动必须合并推进。
- 不改领域计算，不移植到前端组件，不重写 SQL 业务。数据库异步化必须处理事务隔离，不能将 BEGIN/COMMIT 分散到会并发交错的 Promise 中。
- 保留既有 feat/p1-inprocess-runtime 分支继续，不改用户已有 repl-driver.tmp.mjs。
- Android 先调试 APK；签名密钥、商店发布、iOS 不属于此次本地验收。
- 所有凭据仅使用现有公开 Supabase URL/anon key；不公开私钥、service_role 或本地会话。

## Task 1：异步数据库边界与原有后端适配

拥有 src/main（排除新增 mobileNativeSqliteProvider.ts、nativeHttpTransport.ts）及对应测试；与主执行者提前冻结数据库适配接口。

- [x] 用延迟驱动测试先证明异步读取、事务回滚和两个并发事务不会串扰。
- [x] 提供数据库执行器与序列化事务包装；Node SQLite provider 完成初始化后供桌面使用。
- [x] 将迁移、仓储、缓存、用例及 HTTP/IPC 调用改为正确 await，保留现有 DTO 行为。
- [x] 处理首次移动登录云端分组本地未物化，以及相关云端写入 error 未检查的问题。
- [x] 跑对应测试、类型检查并记录结果；不要提交其他执行者文件。

## Task 2：Android 工程与原生适配（主执行者）

- [x] 安装兼容版本 Capacitor core/android/cli、SQLite、App；建立独立 mobile Vite 构建与 capacitor.config。
- [x] 实现 Capacitor SQLite 执行器，复用 Task 1 迁移和事务包装；启动 React 前完成原生 DB 初始化。
- [x] 原生 HTTP 接入现有网关/httpClient，保留状态码、GBK、超时与 Referer 语义。
- [x] 配置 Android 返回键与安全区域；Capacitor native 自动选择 inprocess。
- [x] 构建 Android debug APK，能连接模拟器/设备时安装运行。

## Task 3：验证与收尾

- [x] 全量 npm test、npm run typecheck、桌面生产构建、mobile 构建、Gradle assembleDebug。
- [x] 验证离线本地数据增删改及重启持久化，原生网络搜索；真实登录未具备测试账号时明确未验收范围。实际覆盖 Activity 重开，整机/进程重启与真实账户待补充。
- [x] 独立审查、修复重要问题，更新 Android 状态与构建文档；按仓库 Git 约定提交。

## 最终验收（2026-09-20）

83 文件 / 489 项 Vitest 测试、typecheck、Electron 与 mobile 构建通过。Android 调试 APK 签名校验通过，安装至 Android 15 x86_64 模拟器；最终产物两项 instrumentation 测试全部通过（原生行情/共享资产搜索、分组增删改/Activity 重开持久化）。独立复审未遗留 Important/Critical。真实账号、真机、完整进程重启以及原生文件分享的后续边界见 `docs/ANDROID-BUILD.md`。

## Review Focus

- 多页面并发写入不能互相提交或回滚事务。
- 首次安装本地空库下的云端增删改应成功且报错真实。
- 原生接口错误不得伪装成空数据或成功同步。
- Node/Electron 依赖不能进入 Android 前端 bundle。
- 桌面 SQLite 迁移、缓存及原有业务功能不能因 async 改造回归。
