# Android 构建与验收

Android 使用 Capacitor 7 打包应用界面，在 App 内直接运行共享业务用例。数据保存在应用私有目录的原生 SQLite；行情请求通过 Capacitor 原生 HTTP 发出，不需要电脑上的 Electron 或本地 HTTP 服务。

## 构建

需要 Node.js 22、JDK 21、Android SDK Platform 35、Build Tools 34.0.0 和 platform-tools。安装 Android Studio 后可在 SDK Manager 中安装这些组件，使用正式 JDK 或 Android Studio 中符合版本要求的 JBR。

```powershell
$env:ANDROID_JAVA_HOME = 'C:/path/to/jdk-21'
$env:ANDROID_HOME = 'C:/Users/your-name/AppData/Local/Android/Sdk'
npm ci
npm run android:debug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。这是调试签名包，可安装验证，不是商店发布包。最低 Android 7（API 24），目标 API 35。

```powershell
# 连接开启 USB 调试的手机或启动模拟器后安装
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 更新网页资源与原生插件
npm run android:sync

# 在 Android Studio 打开工程
npm run android:open

# 设备测试：原生插件与手机宽度下的实际页面流程
npm run android:test
```

设备测试必须使用无登录会话、CSS 视口不超过 600px 的测试安装，不使用个人账户。`NativeRuntimeTest` 直接调用业务 API，验证原生插件和分组持久化；`NativeUiFlowTest` 操作打包后的 WebView 表单、导航和按钮，不导入业务 API，验证搜索操作可见、登录入口和股票详情加载。测试只创建并清理 `native-smoke-*` 本地分组；网络测试读取公开行情、搜索和详情。测试报告位于 `android/app/build/reports/androidTests/connected/`。

构建脚本优先使用 `ANDROID_JAVA_HOME`，其次本工作区 `.runtime-data/tools/jdk21`，最后 `JAVA_HOME`。SDK 优先使用 `ANDROID_HOME` / `ANDROID_SDK_ROOT`，Windows 默认使用用户目录下的 Android SDK。`android/local.properties`、构建产物和本地工具均不提交。

## 运行时边界

| 环境 | 业务入口 | 数据库 / 网络 |
| --- | --- | --- |
| Android App | `inprocessRuntimeApi` | Capacitor SQLite / Capacitor HTTP |
| Electron | preload IPC | Node SQLite / Axios |
| 浏览器预览 | HTTP 或 `?runtime=mock` | 无头主进程或演示数据 |

原生环境自动启用进程内 API，不需要 URL 参数。浏览器不能用 `?runtime=inprocess` 替代 Android 原生插件；浏览器用于界面辅助预览。

数据库迁移和仓储 SQL 两端共用。所有读写均异步等待；同一连接上的事务整体串行，事务内仓储必须使用传入的执行器。React 挂载前先完成数据库迁移，再安装网络传输并加载业务入口。

`.env` 中的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 在构建时注入公开客户端配置；不要把 `service_role`、数据库密码或其他服务端密钥放入移动构建。未配置时仍可使用本地模式。登录会话保存在 App WebView 的本地存储，桌面会话仍使用原文件存储。

Android 15 使用原生系统栏边距避免遮挡。系统返回键返回上一页，在首页将应用转入后台。

## 当前限制

- SQLite 备份文件的导入/导出仅支持桌面；手机设置页禁用对应按钮。手机可使用已有云同步入口。
- 图片/CSV 的原生保存与系统分享、商店签名发布、iOS 尚未实现。
- 邮件确认使用 Supabase 项目的 Site URL；尚未接入 Android 深链接自动回到 App，验证邮箱后需回到 App 登录。
- 设备测试覆盖 Activity 重开，不等价于断电、系统杀进程及真实账号多设备同步验收；这些仍需真机补充验证。

原技术评估见 `ANDROID-PORT-ASSESSMENT.md`；P1“在线模式不需要本地 SQLite”的旧假设已被实际仓储依赖否定，因此 P1 与原生驱动阶段合并实现。

## 2026-09-20 验证记录

- 83 个 Vitest 文件、489 项测试通过，TypeScript 检查通过。
- Electron 生产构建与移动端 Vite 构建通过；移动构建仍有大于 500 kB 的分包体积提示。
- Android 15 x86_64 模拟器成功安装和冷启动，原生数据库文件位于应用私有 `databases/dividend-monitorSQLite.db`。
- 两项 Android instrumentation 测试通过：共享业务 API 分组增删改及 Activity 重开持久化；原生 HTTP 公开行情和共享资产搜索。
- 云端写入失败、跨设备成员删除、桌面恢复备份后的连接重开经边界 mock + 真实 SQLite 回归，并经独立代码审查。真实 Supabase 账号/RLS、多设备同步与真实手机仍待验收。

本机首次构建修复了不完整的 SDK Platform 35，并补齐 Build Tools 34。全局 Gradle `init.gradle` 中旧 JCenter 镜像曾导致依赖缺失，临时构建配置使用官方仓库；项目不修改全局镜像配置，也不关闭 TLS 校验。

## 2026-09-21 界面复现与修复

- 在 Android 15 x86_64 模拟器操作原交付 APK：搜索 `600519`、`601398` 均返回结果，但详情和加入自选按钮位于表格横向滚动区域外；点击资产名称没有作用。手机搜索结果现改为单列，资产名称可点击，操作按钮直接可见。
- 导航中的“登录 / 注册”原先跳到用户中心，需要再次向下滚动找到登录按钮。现直接打开登录表单。两条界面回归测试在原 APK 失败，在修复 APK 通过。
- 使用虚构账号在实际登录表单提交，收到“邮箱或密码错误”。这仅验证了认证请求及错误反馈，不代表成功登录或云同步已验收；没有使用个人账号，也没有向云端写入资产。
- 模拟器 34.2.15、37.1.11 在 SwiftShader 软件渲染下加载详情时发生 Windows `0xc0000005` 崩溃。工作区内独立安装的官方 37.1.11 改用 `-gpu host -feature -Vulkan` 后，三个界面测试全部通过（43.45 秒），包括实际搜索后点击工商银行详情并验证详情页展示资产名称。不修改全局 SDK；这不是 Vivo 真机崩溃的结论。
- 修复版本通过 TypeScript 检查、83 个 Vitest 文件 / 489 项测试、移动资源和 APK 构建、APK v2 签名校验。修复包为 `release/android/shou-xi-lao-0.3.0-ui-fix-debug.apk`，旁附 SHA256 文件。
- Vivo X80 / OriginOS 6 真机、成功登录、云端资产推拉及账号切换仍需单独验证。
