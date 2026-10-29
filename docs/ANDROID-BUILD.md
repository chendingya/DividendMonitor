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

默认设备测试必须使用无登录会话、CSS 视口不超过 600px 的测试安装，不使用个人账户。`NativeRuntimeTest` 直接调用业务 API，验证原生插件、分组持久化及 Activity 销毁时未提交事务回滚；`NativeUiFlowTest` 操作打包后的 WebView 表单、导航和按钮，不导入业务 API，验证搜索操作可见、登录入口和股票详情加载。测试创建并清理 `native-smoke-*` 本地分组及 `native_lifecycle_smoke` 探针记录；网络测试读取公开行情、搜索和详情。测试报告位于 `android/app/build/reports/androidTests/connected/`。

`NativeUserJourneyTest` 是需显式启用的完整界面测试，默认跳过。通过 instrumentation 参数 `journeyPhase` 选择阶段；`register` / `login` / `restore` 还需传入专用测试账号的 `email`、`password`，不要把凭据写入脚本、文档或提交记录。

| 阶段 | 实际界面操作 / 断言 |
| --- | --- |
| `register` | 填写注册表单，接受立即登录或注册成功后等待邮箱确认；邮件确认独立完成 |
| `login` | 正常登录表单提交并进入首页 |
| `create` | 空持仓安装搜索工商银行、打开详情、加入自选，录入两笔各 100 股，编辑其中一笔仍合计 200 股 |
| `sync` / `pull` | 用户中心点击双向同步 / 仅拉取，要求无同步错误且持仓仍是两笔共 200 股 |
| `restore` | 空本地安装登录、云端拉取、自选与持仓验证、编辑日期及单笔数量、退出登录后再次读取本地数据 |
| `verify` | 验证两笔 200 股、买入日及自选，可在 `am force-stop` 后执行检查进程重启持久化 |
| `edit` / `logout` | 单独验证恢复后编辑交易 / 退出登录并读取本地数据，便于定位中间步骤 |
| `layout` | 手机首页无横向溢出、标题单行、主操作高度至少 44px、首屏区域高度受限 |

这些阶段只能针对专用测试安装执行。`create` 要求测试标的没有持仓；`restore` 之前清空 App 数据会删除该安装的全部本地数据，必须先确认专用测试数据已成功同步。测试通过界面填值和原生触摸事件操作按钮，不导入业务 API、不预置数据库。原生触摸坐标使用 `visualViewport`，包含表单后的可视区域偏移。

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
- 模拟器覆盖 Activity 重开、强制停止后重启和真实账号云端推拉；真实手机的系统回收、断电及多设备同时编辑仍需补充验收。

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

## 2026-10-29 完整链路回归与手机排版

- 手机工作台将搜索、录入持仓放在并排主操作区，次要操作收进“更多操作”；概览与持仓采用手机卡片布局。用户中心状态卡和同步说明适配窄屏。交易表单内部滚动，底部保留取消与保存按钮；浅色系统栏使用深色图标。
- 在线新增持仓只生成一次主键，本地与云端共用；推拉与合并保留交易价、买入日、风险、除权游标和版本时间。云端 `TIMESTAMPTZ` 在读取边界保留原始日历日期，避免日期输入框为空和同日除权遗漏。编辑多笔持仓时使用所选交易的股数和风险，允许清空风险等级。
- 首次进入持仓不再等待外部行情：先应用已有分红缓存并展示持仓，行情补全后重新应用新分红。自选详情等待预算为 2 秒，随后展示缓存或已保存条目，并标明行情状态；晚到请求仍可更新缓存。
- 冷启动验收还发现历史价格逐行跨 Capacitor 桥写入，长事务阻塞其他数据库读取。价格缓存现每 200 行批写，单批 600 个参数；1202 条从 1202 次调用降至 7 次，并保留同一事务的完整回滚。
- 连续 Activity 重建时，旧插件可能持有未结束的事务。应用本地 `NativeDatabaseLifecycle` 插件在旧 Bridge 线程回滚并释放连接，下一 Activity 打开数据库前等待释放屏障；真实清理错误保留日志和启动反馈，不删除数据库或吞掉错误。
- TypeScript 检查、90 个 Vitest 文件 / 540 项测试通过。价格缓存回归使用真实 SQLite 验证跨批覆盖、排序、资产隔离及后批失败回滚；持仓与自选慢行情测试均先复现失败再验证修复。
- 测试账号使用用户提供的邮箱并完成邮件验证，未提交账号凭据或验证链接。项目恢复运行后，专用模拟器使用电脑已有代理访问 Supabase；代理仅是测试设备网络设置，未写入 App 或修改 Windows 全局配置。
- Android 15 x86_64 专用模拟器从 `pm clear` 后的空本地数据执行真实界面链路：登录 → 拉取 1 条自选和 2 笔共 200 股 → 自选查看 → 编辑其中 100 股、验证买入日 → 保存后仍是 200 股 → 退出登录 → 再次从原生 SQLite 读取自选与持仓，最终包整段 62.467 秒通过。所有按钮通过原生触摸事件操作，未在测试中导入业务 API 或预置数据库。
- 同一 instrumentation 进程连续运行 3 项原生运行时和 4 项界面回归全部通过（52.668 秒），包含已提交探针值保留、未提交更新在 Activity 销毁时回滚及后续正常启动。强制停止后的 200 股及自选读取、411px 与 360px 首页几何检查均通过；已恢复模拟器原始显示密度。
- 调试交付包为 `release/android/shou-xi-lao-0.3.0-full-flow-debug.apk`，附 `.sha256`；包含 `arm64-v8a`，APK v2 签名校验通过。Vivo X80 / OriginOS 6 真机和账号切换、多台真实设备同时编辑仍需单独验收。
