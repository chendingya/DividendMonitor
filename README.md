# 收息佬 / DividendMonitor

面向长期投资者的本地优先收益分析工具，当前聚焦 A 股、ETF 与基金的收益追踪、估值对比与回测。

DividendMonitor is a local-first income and valuation analysis tool for long-term investors, currently focused on China A-shares, ETFs, and funds.

## 中文简介

`收息佬（DividendMonitor）` 是一个基于 Electron、React 与 TypeScript 构建的桌面优先项目，目标是帮助长期投资者用统一口径完成以下工作：

- 搜索股票、ETF 与基金，并进入统一详情页
- 查看历史分红、收益指标和估值分位
- 进行多资产横向对比
- 管理自选与持仓
- 运行股息复投回测
- 在桌面端与浏览器预览端之间复用同一套前端能力

当前仓库以 Windows 桌面端为主，同时保留浏览器预览模式用于联调与前端验证。

## English Overview

`DividendMonitor` is an Electron desktop-first project built with React and TypeScript. It helps long-term investors analyze income-focused assets with a consistent methodology:

- Search A-shares, ETFs, and funds through a unified asset flow
- Inspect dividend history, yield metrics, and valuation percentiles
- Compare multiple assets side by side
- Manage watchlists and portfolio positions
- Run dividend reinvestment backtests
- Reuse the same renderer capabilities across desktop runtime and browser preview

The repository currently targets Windows desktop delivery first, while keeping a browser preview mode for UI and runtime verification.

## 当前能力

- 多资产搜索、详情、自选、对比、回测
- 股票估值趋势与分位图表
- 本地优先的数据与持久化链路
- Electron 桌面端打包与 Windows 安装包输出
- 浏览器 fallback 运行时与本地 HTTP API 联调

## 技术栈

- Electron
- React
- TypeScript
- Vite / electron-vite
- Ant Design
- ECharts
- SQLite
- Vitest

## 快速开始

安装依赖并启动桌面开发环境：

```bash
npm install
npm run dev
```

启动浏览器预览模式：

```bash
npm run dev:browser-preview
```

运行类型检查与测试：

```bash
npm run typecheck
npm test
```

构建 Windows 安装包：

```bash
npm run dist:win
```

## 文档入口

- Docs Index: [docs/README.md](file:///i:/code/DividendMonitor/docs/README.md)
- 产品需求: [PRD.md](file:///i:/code/DividendMonitor/docs/PRD.md)
- 系统设计: [SDD.md](file:///i:/code/DividendMonitor/docs/SDD.md)
- 多资产架构: [MULTI-ASSET-ARCHITECTURE.md](file:///i:/code/DividendMonitor/docs/MULTI-ASSET-ARCHITECTURE.md)
- 打包与部署: [PACKAGING-AND-DEPLOYMENT.md](file:///i:/code/DividendMonitor/docs/PACKAGING-AND-DEPLOYMENT.md)
- 发布说明: [RELEASE-NOTES-v0.1.0.md](file:///i:/code/DividendMonitor/docs/RELEASE-NOTES-v0.1.0.md)

## 开源与商业化说明

本仓库当前以强 Copyleft 方式开源，适合：

- 要求再分发和修改版本继续开源
- 要求保留版权与许可证声明
- 不希望他人把修改后的网络服务闭源运行

未来如果作者提供托管服务、赞赏版、会员功能、商业授权或闭源附加组件，这些新增内容可以使用单独的商业条款；但已经以开源许可证发布的代码副本，其既有授权通常不可被追溯撤销。

## License

This repository is licensed under `GNU Affero General Public License v3.0`.

- License text: [LICENSE](file:///i:/code/DividendMonitor/LICENSE)
- Trademark and branding notice: [TRADEMARKS.md](file:///i:/code/DividendMonitor/TRADEMARKS.md)

简要说明：

- 你可以使用、修改和再分发本项目
- 如果你分发修改版，必须继续提供对应源代码并保留版权/许可证声明
- 如果你把修改版作为网络服务对外提供，仍需按 AGPL 提供对应源代码
- 项目名称、Logo、作者署名与品牌识别不自动授予商标使用权

## Status

- Version: `0.1.0`
- Platform focus: `Windows desktop`
- Data scope: `A-shares / ETF / Fund`
- Packaging: `electron-builder` + `NSIS`

