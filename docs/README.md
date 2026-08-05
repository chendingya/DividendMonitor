# Docs Index

## 1. 推荐阅读顺序

如果你是第一次进入仓库，建议按下面顺序阅读：

1. `PRD.md`：产品目标、范围和 MVP 能力
2. `SDD.md`：系统设计总览、技术选型和运行时结构
3. `ARCHITECTURE.md`：代码分层、目录职责、依赖方向和当前实现边界
4. `MULTI-ASSET-ARCHITECTURE.md`：股票扩展到 ETF/基金的多资产架构设计与实施计划
5. `DATA-SOURCE-GATEWAY-ARCHITECTURE.md`：统一第三方数据源、URL、降级与保护机制的架构设计
6. `ONLINE-ARCHITECTURE.md`：在线版架构设计 — Supabase 认证、云端数据库、离线/在线切换
7. `IPC-CONTRACTS.md`：preload、IPC 和 renderer runtime 接口
8. `HTTP-API.md`：本地 HTTP API（headless 模式）路由清单与认证
9. `PACKAGING-AND-DEPLOYMENT.md`：Windows exe 打包与网页部署现状、步骤和缺口
10. `UI-UX-DESIGN-PRINCIPLES.md`：页面视觉与交互风格

## 2. 当前有效文档

### 产品与设计

- `PRD.md`
- `UI-UX-DESIGN-PRINCIPLES.md`
- `FRONTEND-IMPLEMENTATION-PLAN.md`（前端已落地能力与未完成项）

### 架构与实现

- `SDD.md`
- `ARCHITECTURE.md`
- `MULTI-ASSET-ARCHITECTURE.md`
- `DATA-SOURCE-GATEWAY-ARCHITECTURE.md`
- `ONLINE-ARCHITECTURE.md`
- `IPC-CONTRACTS.md`
- `HTTP-API.md`
- `PACKAGING-AND-DEPLOYMENT.md`

### 数据源调研与沉淀

- `housing-module-research.md`：房产模块数据源调研（东财 70 城指数 / 中指研究院 / 统计局）+ 已确认决策
- `yield-map-research.md`：股息率地图预调研（全市场接口实测 / TTM 口径决策 / Supabase 迁移记录）
- `yield-map-acceptance.md`：股息率地图验收记录（回归基准 + 遗留项清单）
- `portfolio-import-research.md`：持仓导入可行性调研（SHELVED，未来重启可复用）

## 3. 文档边界

为减少"计划文档过期后继续误导实现"的问题，当前 `docs/` 只保留两类文档：

1. 描述当前实现与稳定边界的长期文档
2. 仍然持续指导开发与验收的工作文档

已经完成使命的一次性迁移方案、实施计划（`superpowers/plans|specs`）、RFC 和会话交接文档不再保留，统一从仓库历史中查阅（`git log`）。

## 4. 与代码的对应关系

- `src/main/`：主进程 use case、repository、adapter、infrastructure
- `src/preload/`：桥接层
- `src/renderer/src/`：页面、组件、hook、runtime service
- `shared/contracts/api.ts`：跨进程共享 DTO 与 API 契约（IPC 与 HTTP 的唯一共享源）
