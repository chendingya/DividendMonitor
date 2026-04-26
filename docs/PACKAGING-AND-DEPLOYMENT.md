# 打包与部署指南

本文说明当前仓库如何：

1. 构建 Electron 桌面端产物
2. 进一步打包成 Windows `exe`
3. 以网页形式部署

同时会明确区分：

- 当前仓库已经具备的能力
- 还没有配置完成、需要补充的部分

## 1. 当前现状

### 1.1 已具备

- 桌面端基于 Electron + `electron-vite`
- 已提供开发命令：
  - `npm run dev`
  - `npm run dev:browser-preview`
- 已提供构建命令：
  - `npm run build`
- 主进程内置了本地 HTTP API：
  - 默认地址是 `http://127.0.0.1:3210`
- Renderer 在没有 Electron preload bridge 时，会自动走 HTTP runtime

### 1.2 当前缺口

当前仓库已经完成了最小可用的 Windows 安装包打包链路：

- 已接入 `electron-builder`
- 已配置 NSIS
- 已提供脚本：
  - `npm run dist:dir`
  - `npm run dist:win`

当前仍然存在的缺口主要是发布质量层面的细节：

- 还没有自定义应用图标，当前会使用默认 Electron 图标
- `package.json` 已补齐 `author`、`homepage`、`repository` 与产品信息
- 已补齐 GitHub Release 发布目标配置，但当前环境仍未提供发布认证
- 还没有代码签名证书，因此当前产物仍会显示为未签名
- 还没有自动更新发布流程

另外，网页部署目前也有一个明确限制：

- 前端 HTTP API 基址写死为 `http://127.0.0.1:3210`

对应代码：

- [httpClient.ts](file:///i:/code/DividendMonitor/src/renderer/src/services/httpClient.ts)
- [api.ts](file:///i:/code/DividendMonitor/shared/contracts/api.ts)

这意味着：

- 本地浏览器预览可以工作
- 直接部署到公网域名时，前端仍会请求用户本机的 `127.0.0.1:3210`
- 所以当前代码不能直接作为“纯前端网页”部署到公网后正常使用

## 2. 本地开发与预览

### 2.1 Electron 开发模式

```bash
npm install
npm run dev
```

作用：

- 启动 Electron 主进程
- 启动 Renderer 开发服务器
- 打开桌面窗口
- 同时启动本地 HTTP API

适用场景：

- 日常桌面端开发
- 联调 preload / IPC / HTTP fallback

### 2.2 浏览器预览模式

```bash
npm install
npm run dev:browser-preview
```

作用：

- 启动 headless Electron runtime
- 启动本地 HTTP API
- 不弹出 Electron 窗口
- 前端可通过浏览器访问开发页

脚本入口：

- [dev-browser-preview.mjs](file:///i:/code/DividendMonitor/scripts/dev-browser-preview.mjs)

主进程 headless 判断：

- [index.ts](file:///i:/code/DividendMonitor/src/main/index.ts)

适用场景：

- 验证 browser fallback
- 调试 HTTP runtime
- 手工检查网页体验

## 3. 构建 Electron 产物

### 3.1 构建命令

```bash
npm install
npm run build
```

当前命令来自：

- [package.json](file:///i:/code/DividendMonitor/package.json)

### 3.2 构建输出

构建后可重点关注：

- `out/main/`
- `out/preload/`
- `out/renderer/`

这些是 Electron 运行所需的构建结果，但它们不是最终分发给用户安装的 Windows 安装包。

### 3.3 这一步的意义

`npm run build` 的作用是：

- 编译主进程代码
- 编译 preload
- 构建 renderer 静态资源

它解决的是“代码能否被构建”，不是“如何交付给最终用户安装”。

## 4. 如何打包成 Windows exe

当前仓库已经支持直接生成 Windows 安装包。

### 4.1 依赖与脚本

当前已接入：

- `electron-builder`
- `dist:dir`
- `dist:win`

对应配置在：

- [package.json](file:///i:/code/DividendMonitor/package.json)

### 4.2 典型打包流程

```bash
npm install
npm run typecheck
npm test
npm run dist:win
```

成功后，预期会在：

- `release/`

看到类似：

- `收息佬 Setup x.y.z.exe`
- `win-unpacked/`

本仓库当前一次实际验证后的产物示例：

- `release/收息佬 Setup 0.1.0.exe`
- `release/win-unpacked/DividendMonitor.exe`

### 4.3 两个打包命令的区别

#### `npm run dist:dir`

作用：

- 先构建 Electron 产物
- 再输出可运行目录

输出重点：

- `release/win-unpacked/DividendMonitor.exe`

适用场景：

- 调试打包配置
- 检查资源是否完整
- 不想每次都生成安装向导

#### `npm run dist:win`

作用：

- 先构建 Electron 产物
- 再生成 NSIS 安装包

输出重点：

- `release/收息佬 Setup <version>.exe`

适用场景：

- 提供给最终用户安装
- 交付测试包
- 验证安装、卸载与升级流程

### 4.4 打包 exe 前建议检查

建议至少确认以下内容：

1. `npm run typecheck` 通过
2. `npm test` 通过
3. `npm run build` 成功
4. 图标、产品名、版本号已确定
5. GitHub Release 文案与安装包文件名一致
6. SQLite 数据目录是否符合安装版预期
7. 首次启动是否需要初始化本地数据目录

### 4.5 当前已知注意事项

- 当前会提示使用默认 Electron 图标
- 当前没有代码签名证书，`Get-AuthenticodeSignature` 会显示 `NotSigned`
- Windows 设备上仍可能出现“未知发布者”提示

这些不会阻止打包，但会影响最终交付体验。

### 4.6 如果要“绿色版 exe”

如果你想要的不是安装包，而是“解压即用”的目录版本，可以考虑：

- 直接使用 `npm run dist:dir`
- 或后续改成 `portable` 目标

但通常建议先把 NSIS 安装包打通，再决定是否额外提供绿色版。

### 4.7 当前签名与发布配置说明

当前仓库已经完成以下配置：

- `author` / `description` / `homepage` / `repository`
- `electron-builder` 的 `publish.github`
- 安装包产物命名为 `收息佬 Setup <version>.exe`

如果后续要启用真实 Windows 代码签名，推荐直接沿用 `electron-builder` 默认环境变量：

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

满足上面两个前提后，重新执行：

```bash
npm run dist:win
```

即可在打包时自动签名。

## 5. 如何做网页部署

这里必须先区分两种目标。

### 5.1 目标 A：本地浏览器预览

这是当前仓库已经支持的。

做法：

```bash
npm install
npm run dev:browser-preview
```

适合：

- 本机打开浏览器体验界面
- 不依赖 Electron 窗口
- 但仍依赖本机启动的 Node/Electron 主进程与本地 HTTP API

这不属于真正的公网网页部署，更像“浏览器形态运行本地应用”。

### 5.2 目标 B：公网网页部署

这是大家通常理解的：

- 前端部署到服务器/CDN
- 用户通过域名访问
- 后端接口部署到服务器

这一目标当前仓库不能直接完成，主要有两个原因。

#### 原因 1：前端 API 地址写死

当前前端请求固定走：

- `http://127.0.0.1:3210`

这只适合用户本机存在本地 API 服务的情况，不适合公网部署。

#### 原因 2：当前 HTTP 服务是主进程内嵌服务

现在的 HTTP API 是随 Electron 主进程启动的本地服务，不是独立部署的 Web 后端。

入口见：

- [server.ts](file:///i:/code/DividendMonitor/src/main/http/server.ts)

### 5.3 如果要支持公网网页部署，最少需要做的改造

建议按下面步骤做。

#### 第一步：把 API 基址改成可配置

当前是常量写死，建议改成：

- 优先读取 `VITE_API_BASE_URL`
- 未配置时，再回退到 `LOCAL_HTTP_API_ORIGIN`

目标效果：

- 本地开发仍可走 `127.0.0.1:3210`
- 线上可改为：
  - `https://api.your-domain.com`
  - 或 `/api`

#### 第二步：把 HTTP API 从 Electron 主进程中解耦

当前模式：

- Electron 主进程内置 HTTP server

网页部署推荐模式：

- 单独 Node 服务
- 或者迁移成标准 Web API 服务

可选方案：

1. 复用现有 route / use case，单独起一个 Node 入口
2. 用 Express / Fastify 包装现有 `src/main/http/routes/*`
3. 再由 Nginx / Caddy 反代出去

#### 第三步：明确数据存储策略

桌面端当前包含：

- 本地 SQLite
- 本地持仓/自选相关数据

如果变成网页部署，需要重新定义：

- 用户数据存哪里
- 多用户如何隔离
- 是否需要登录
- 是否仍允许匿名 localStorage 模式

这一步如果不先想清楚，网页部署会出现“只有单机体验，没有真正在线账户能力”的问题。

### 5.4 推荐的网页部署架构

推荐拆成两部分：

1. 前端静态资源
2. 独立 Web API

#### 前端

可以部署到：

- Nginx
- Vercel
- Netlify
- Cloudflare Pages

#### 后端

可以部署到：

- 云服务器上的 Node 服务
- Railway / Render / Fly.io
- Docker 容器

#### 反向代理

建议最终形成：

- `https://your-domain.com` -> 前端
- `https://your-domain.com/api` -> 后端接口

这样前端只需要请求相对路径 `/api/...`。

### 5.5 当前仓库下的“网页部署”建议结论

如果你现在的目标只是：

- 在浏览器里体验页面
- 不需要公网给别人用

那就用：

```bash
npm run dev:browser-preview
```

如果你的目标是：

- 真正部署到公网
- 用户通过域名访问

那必须先补：

1. API 基址可配置
2. 独立后端服务
3. 数据存储与用户体系设计

## 6. 推荐的实际交付路径

如果你的近期目标是“先能交付给别人使用”，建议优先级如下：

### 路线 1：先出 Windows 安装包

适合当前项目阶段。

原因：

- 当前架构本来就是桌面应用优先
- 本地 SQLite / 本地运行时模型已经存在
- 成本明显低于完整网页化改造

建议顺序：

1. 使用 `npm run dist:win` 生成安装包
2. 手工安装测试
3. 再补图标、版本号、签名
4. 最后再接自动更新

### 路线 2：后续再做真正网页化

等桌面端稳定后再推进：

1. API 基址配置化
2. HTTP 服务独立部署
3. 存储改造
4. 登录与多用户能力

## 7. 一份最实用的命令清单

### 本地开发

```bash
npm install
npm run dev
```

### 浏览器本地预览

```bash
npm install
npm run dev:browser-preview
```

### 构建 Electron 产物

```bash
npm install
npm run build
```

### 打包 Windows exe

```bash
npm install
npm run typecheck
npm test
npm run dist:win
```

## 8. 对你的直接建议

如果你现在最关心“如何交付给用户”，建议先做：

1. 直接使用 `npm run dist:win`
2. 写一份安装与升级说明
3. 再补图标与签名

如果你更关心“网页部署”，建议下一步先做的不是部署，而是代码改造：

1. 把 API 地址配置化
2. 把本地 HTTP 服务拆成独立服务

否则现在写再多部署步骤，也会卡在 `127.0.0.1:3210` 这个硬编码上。
