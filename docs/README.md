# Docs Index

## 1. 推荐阅读顺序

如果你是第一次进入仓库，建议按下面顺序阅读：

1. `PRD.md`：产品目标、范围和 MVP 能力
2. `SDD.md`：系统设计总览、技术选型和运行时结构
3. `ARCHITECTURE.md`：代码分层、目录职责、依赖方向和当前实现边界
4. `MULTI-ASSET-ARCHITECTURE.md`：股票扩展到 ETF/基金的多资产架构设计与实施计划
5. `IPC-CONTRACTS.md`：preload、IPC 和 renderer runtime 接口
6. `PACKAGING-AND-DEPLOYMENT.md`：Windows exe 打包与网页部署现状、步骤和缺口
7. `MANUAL-VERIFICATION-GUIDE.md`：手动验证路径
8. `UI-UX-DESIGN-PRINCIPLES.md`：页面视觉与交互风格

## 2. 当前有效文档

### 产品与设计

- `PRD.md`
- `UI-UX-DESIGN-PRINCIPLES.md`

### 架构与实现

- `SDD.md`
- `ARCHITECTURE.md`
- `MULTI-ASSET-ARCHITECTURE.md`
- `IPC-CONTRACTS.md`
- `PACKAGING-AND-DEPLOYMENT.md`

### 交互与验收

- `FRONTEND-IMPLEMENTATION-PLAN.md`
- `MANUAL-VERIFICATION-GUIDE.md`

## 3. 文档边界

为减少“计划文档过期后继续误导实现”的问题，当前 `docs/` 只保留两类文档：

1. 描述当前实现与稳定边界的长期文档
2. 仍然持续指导开发与验收的工作文档

已经完成使命的一次性迁移方案、目录重构计划和中间过渡文档不再保留在主 `docs/` 目录中。

## 4. 与代码的对应关系

- `src/main/`：主进程 use case、repository、adapter、infrastructure
- `src/preload/`：桥接层
- `src/renderer/src/`：页面、组件、hook、runtime service
- `shared/contracts/api.ts`：跨进程共享 DTO 与 API 契约
