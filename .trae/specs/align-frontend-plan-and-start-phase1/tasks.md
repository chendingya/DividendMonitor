# Tasks

- [x] Task 1: 对齐前端实施计划文档（基于 PRD/SDD）
  - [x] SubTask 1.1: 逐条映射 PRD 的页面与能力（搜索、详情、自选、对比、回测、地图、设置）到现有前端阶段计划
  - [x] SubTask 1.2: 逐条映射 SDD 的架构约束（AppShell、路由、组件复用、状态口径）到计划中的执行策略
  - [x] SubTask 1.3: 更新 `docs/FRONTEND-IMPLEMENTATION-PLAN.md`，补齐“范围、产出、验收点、依赖关系”

- [x] Task 2: 实施 Phase 1（导航与图标补齐）
  - [x] SubTask 2.1: 统一一级导航图标语义与激活态表现
  - [x] SubTask 2.2: 补齐顶部栏与关键卡片图标，并统一尺寸、颜色、间距规则
  - [x] SubTask 2.3: 校正 `theme.css` 与组件样式，确保图标体系不与现有视觉令牌冲突

- [x] Task 3: 实施 Phase 2（页面跳转闭环）
  - [x] SubTask 3.1: 设计并接入路由参数（至少覆盖股票详情入口）
  - [x] SubTask 3.2: 打通“概览 -> 详情”“自选 -> 详情”“自选 -> 对比 -> 详情”“详情 -> 回测”路径
  - [x] SubTask 3.3: 保证返回或二次进入时关键上下文（股票代码、对比对象）可保留或可恢复

- [x] Task 4: 联调与验证
  - [x] SubTask 4.1: 运行 `npm run typecheck` 并修复新增类型问题
  - [x] SubTask 4.2: 手工验证主路径跳转与关键页面状态（loading/error/empty）不回退
  - [x] SubTask 4.3: 回填文档中的阶段完成状态与下一阶段建议

- [x] Task 5: 补齐并固化主要页面状态证据（Checklist 第 6 项）
  - [x] SubTask 5.1: 在 `comparison/detail/backtest` 页面补齐显式 empty/no-data 状态（与 loading/error 区分）
  - [x] SubTask 5.2: 统一状态文案与样式，避免页面间语义不一致
  - [x] SubTask 5.3: 产出首轮核验证据（截图或录屏）并回填到阶段验收记录

# Task Dependencies

- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2
- Task 4 depends on Task 3
- Task 5 depends on Task 4
