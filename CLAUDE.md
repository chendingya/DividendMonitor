# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run dev                  # 启动 Electron 桌面开发环境
npm run dev:browser-preview  # 启动浏览器预览模式（无头主进程 + 前端 dev server）
npm run build                # 生产构建
npm run dist:win             # 构建 Windows NSIS 安装包
npm run typecheck            # TypeScript 类型检查（tsc --noEmit）
npm test                     # 运行全部测试（vitest run）
npm run test:watch           # 监听模式运行测试
```

## 项目概述

收息佬（DividendMonitor）是一个 Electron + React + TypeScript 桌面应用，面向 A 股/ETF/基金的长期投资者的收益分析工具。核心功能：多资产搜索、分红追踪、估值对比、自选管理、持仓管理、股息复投回测。

## 技术栈

- **桌面框架**: Electron 35 + electron-vite 3
- **前端**: React 18 + TypeScript 5.8 (strict) + Ant Design 5 + ECharts 5
- **路由**: HashRouter（兼容 Electron `file://` 协议）
- **数据存储**: SQLite（Node 内建 `node:sqlite`，无 ORM）
- **测试**: Vitest
- **数据源**: 东方财富 / 腾讯 / 新浪免费接口，通过统一网关（SourceGateway）调度

## 路径别名

| 别名 | 路径 |
|------|------|
| `@main/*` | `src/main/*` |
| `@preload/*` | `src/preload/*` |
| `@renderer/*` | `src/renderer/src/*` |
| `@shared/*` | `shared/*` |

TypeScript 编译、Vite 构建、Vitest 测试均已配置这些别名。

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
│   ├── entities/     #   实体定义（Stock, DividendEvent, BacktestTransaction）
│   └── services/     #   领域服务（收益率计算、股息复投回测、估值分位、未来股息率估算）
├── application/
│   ├── useCases/     #   用例编排（每个文件一个用例函数，编排 repository + domain service）
│   └── mappers/      #   DTO 转换（领域模型 ↔ API 合约）
├── repositories/     # 数据访问层（聚合缓存、本地库、远端接口）
├── adapters/         # 外部数据源适配器（东方财富接口封装，策略模式可切换）
├── infrastructure/   # 基础设施
│   ├── dataSources/  #   统一数据源网关（endpoint注册/路由/策略/限流/熔断/缓存/传输）
│   ├── http/         #   HTTP 客户端（axios 封装）
│   ├── supabase/     #   Supabase 云同步客户端
│   └── config/       #   配置（缓存TTL、固定资产池等）
├── ipc/channels/     # IPC 通道注册（按功能域分文件）
└── http/routes/      # 本地 HTTP API（浏览器预览模式用）
```

依赖方向严格单向：`domain → application → repositories/adapters → infrastructure`，禁止反向依赖。

### 渲染进程分层

```
src/renderer/src/
├── pages/            # 路由入口页面，尽量薄，只做布局和路由参数接入
├── components/       # 按功能域组织的业务组件和通用 UI 组件
│   ├── app/          #   通用/布局组件
│   ├── dashboard/    #   工作台组件
│   ├── stock-detail/ #   个股详情组件
│   ├── watchlist/    #   自选组件
│   ├── comparison/   #   对比组件
│   └── backtest/     #   回测组件
├── hooks/            # 自定义 hooks（封装异步请求、刷新、错误处理）
├── services/         # 渲染层运行时入口（封装对 preload API 或浏览器 fallback 的调用）
├── router/           # 路由配置
├── layouts/          # 布局组件
└── styles/           # 全局样式 + Ant Design token 定制
```

### 共享层

`shared/contracts/api.ts` — 主进程和渲染进程之间的完整 API 合约，包含所有 DTO 类型、请求/响应类型、工具函数。这是跨进程通信的类型基础。

## 双运行时设计

项目支持两种运行模式，通过 `src/renderer/src/services/desktopApi.ts` 的运行时检测透明切换：

| 模式 | 触发条件 | 通信方式 | 数据持久化 |
|------|----------|----------|-----------|
| Electron 桌面 | 默认 | IPC (contextBridge) | SQLite |
| 浏览器预览 | `?runtime=mock` | Mock 本地数据 | localStorage |
| 浏览器预览 | 默认 fallback | HTTP → 无头主进程 | SQLite (通过主进程) |

浏览器预览通过 `npm run dev:browser-preview` 启动，设置 `DIVIDEND_MONITOR_HEADLESS=1` 环境变量，主进程以无头模式运行 HTTP API（`http://127.0.0.1:3210`）。

## 多资产统一架构

所有资产通过 `AssetIdentifierDto` (`assetType:market:code`) 统一标识：

```
STOCK:A_SHARE:600519   # 股票
ETF:A_SHARE:510300      # ETF
FUND:A_SHARE:160222     # 基金
```

`AssetProviderRegistry` + `AssetProvider` 接口组成插件化设计。每种资产类型实现自己的 Provider，声明 `capabilities` 表明支持哪些功能。前端通过统一的 `assetApi` 调用，后端根据 assetKey 路由到正确的 Provider。

## 关键设计约束

- **领域层纯净性**: `src/main/domain/` 中的代码不依赖 Electron、IPC、React 或任何 Node.js API，保证可独立单测
- **回测计算必须放在 main/domain**：前端只展示结果，不做核心计算
- **渲染进程不直接访问数据库或第三方接口**：所有数据通过 preload API / browser fallback 获取
- **共享 UI 组件不依赖业务模块**：`components/app/` 中的组件只通过 props 渲染，不感知股票、分红等业务概念
- **DTO 流**: Repository 返回领域对象 → UseCase 返回 DTO → renderer service 生成 ViewModel → component 接收 ViewModel
- **无全局状态管理库**：状态通过 hooks + local state + API 调用管理，`zustand` 在依赖中列出但实际未使用
