<div align="center">

# 收息佬 / DividendMonitor

**面向长期投资者的本地优先收益分析工具**

[简体中文](README.md) · [English](README.en.md)

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-node%3A%3Asqlite-003B57.svg)](https://nodejs.org/api/sqlite.html)

</div>

收息佬（DividendMonitor）是一个 Electron 桌面应用，帮助 A 股、ETF、基金与贵金属的长期投资者用统一口径追踪股息收益、对比估值、管理持仓并回测分红复投策略。数据本地优先存储，可选 Supabase 在线同步实现多设备云备份。

## 界面预览

### 工作台

| 首页 | 持仓相关性矩阵 | 持仓结构分类汇总 |
|:---:|:---:|:---:|
| ![首页](docs/screenshots/首页.png) | ![相关性矩阵](docs/screenshots/相关性矩阵.png) | ![自定义持仓结构分类汇总](docs/screenshots/自定义持仓结构分类汇总.png) |

### 个股详情

| 价格走势与估值水平 | 历史收益与未来收益估算 | 估值趋势 |
|:---:|:---:|:---:|
| ![价格走势与估值水平](docs/screenshots/价格走势与估值水平.png) | ![历史收益与未来收益估算](docs/screenshots/历史收益与未来收益估算.png) | ![估值趋势](docs/screenshots/估值趋势.png) |

### 分红与回测

| 分红估算与统计 | 年度与月度分红 | 分红复投回测 |
|:---:|:---:|:---:|
| ![分红估算与统计](docs/screenshots/分红估算与统计.png) | ![年度月度分红](docs/screenshots/年度月度分红.png) | ![简单分红复投回测](docs/screenshots/简单分红复投回测.png) |

### 自选与设置

| 自选池 | 资产详情 | 云端同步与用户设置 |
|:---:|:---:|:---:|
| ![自选池](docs/screenshots/自选池.png) | ![资产详情](docs/screenshots/资产详情.png) | ![云端本地同步与用户设置](docs/screenshots/云端本地同步与用户设置.png) |

> 截图使用演示账号与公开行情数据，不含任何个人持仓信息。

## 功能特性

- **多资产统一搜索**：股票 / ETF / 基金 / 贵金属一次搜索直达详情，统一口径计算收益指标
- **股息与收益分析**：历史分红事件、年度股息率、最近现金分配、未来股息率估算（基准法，含完整计算过程）
- **估值分析**：PE(TTM) / PB(MRQ) 与历史分位（10 年 / 20 年窗口）、30/50/70 分位参考线、行业均值对比、ROE
- **持仓管理**：同一资产多笔买入/卖出交易明细、除权除息因子法自动调整成本、组合收益率/波动率/夏普比率/最大回撤、持仓相关性矩阵
- **自选分组**：多分组管理自选资产，快速横向比较
- **多股对比**：任意资产并排对比收益率、估值与分红
- **分红复投回测**：按真实历史行情与分红事件模拟股息复投，输出收益曲线、现金分红流水与年化收益
- **分红统计中心**：按持仓估算累计分红收入、年度汇总、月度趋势、个股排行与即将到账提醒
- **行业分析**：持仓行业分布、行业平均股息率 / PE / ROE 与成分股排位
- **图表导出**：PNG 图片（Canvas 合成标题条）与 CSV 数据导出
- **本地优先 + 在线同步**：数据默认存于本机 SQLite；登录 Supabase 账号后可云端备份、多设备同步
- **备份与恢复**：一键备份本地数据文件，支持恢复（含在线模式云端回写）

## 快速开始

**环境要求**：Windows / macOS / Linux，Node.js ≥ 18

```bash
# 安装依赖
npm install

# 启动桌面开发环境（Electron）
npm run dev

# 浏览器预览模式（无头主进程 + 前端 dev server）
npm run dev:browser-preview
# 访问 http://127.0.0.1:8192

# 类型检查
npm run typecheck

# 运行测试（tests/ 目录 50+ 个测试）
npm test

# 构建 Windows 安装包（NSIS）
npm run dist:win
```

## 在线模式（可选）

默认离线模式数据仅存于本机。如需多设备同步：

1. 在 [Supabase](https://supabase.com) 创建项目
2. 复制 `.env.example` 为 `.env`，填入 `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`
3. 在应用内「登录 / 注册」进入在线模式，数据自动同步到云端

## 技术栈

| 类别 | 选型 |
|------|------|
| 桌面框架 | Electron 35 + electron-vite 3 |
| 前端 | React 18 + TypeScript 5.8 (strict) + Ant Design 5 + ECharts 5 |
| 路由 | React Router（HashRouter，兼容 `file://`） |
| 数据存储 | SQLite（Node 内建 `node:sqlite`，无 ORM，自带迁移机制） |
| 在线同步 | Supabase（认证 + 云端仓储） |
| 数据源 | 东方财富 / 腾讯 / 新浪免费行情接口（统一网关调度、限流熔断） |
| 测试 | Vitest |

## 架构简介

```
UI (renderer) → Hook → renderer service → runtime selector
  → Electron bridge → IPC → UseCase → Repository → Adapter → Infra
  → browser fallback (mock / HTTP API)
```

- 主进程按整洁架构分层：`domain`（纯业务）→ `application`（用例）→ `repositories` / `adapters` → `infrastructure`，依赖方向严格单向
- 回测、估值、除权除息等核心计算全部位于领域层，可独立单测
- 跨进程 API 合约集中在 `shared/api.ts`，IPC 与本地 HTTP API 共用同一套 DTO
- 支持 Electron 桌面、浏览器 mock、浏览器 HTTP 三种运行时透明切换

详细文档见 [docs/README.md](docs/README.md)（架构、多资产设计、数据源网关、IPC 契约、HTTP API、UI 设计原则等）。

## 文档索引

| 文档 | 说明 |
|------|------|
| [docs/PRD.md](docs/PRD.md) | 产品需求 |
| [docs/SDD.md](docs/SDD.md) | 系统设计总览 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 代码分层与目录职责 |
| [docs/MULTI-ASSET-ARCHITECTURE.md](docs/MULTI-ASSET-ARCHITECTURE.md) | 多资产架构设计 |
| [docs/DATA-SOURCE-GATEWAY-ARCHITECTURE.md](docs/DATA-SOURCE-GATEWAY-ARCHITECTURE.md) | 数据源网关架构 |
| [docs/ONLINE-ARCHITECTURE.md](docs/ONLINE-ARCHITECTURE.md) | 在线版架构（Supabase） |
| [docs/IPC-CONTRACTS.md](docs/IPC-CONTRACTS.md) | IPC 与运行时接口 |
| [docs/HTTP-API.md](docs/HTTP-API.md) | 本地 HTTP API |
| [docs/PACKAGING-AND-DEPLOYMENT.md](docs/PACKAGING-AND-DEPLOYMENT.md) | 打包与部署 |

## 许可

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 开源：

- 你可以自由使用、修改与再分发（含修改版的网络服务场景）
- 分发或提供网络服务时必须继续开放源代码并保留版权与许可声明
- 项目名称、Logo 与品牌标识的使用见 [TRADEMARKS.md](TRADEMARKS.md)

## 状态

- 版本：`0.3.0`
- 平台：Windows 桌面优先（electron-builder + NSIS），跨平台可构建
- 数据范围：A 股 / ETF / 基金 / 贵金属
