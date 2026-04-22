# 前端计划对齐与首轮执行 Spec

## Why
当前 `FRONTEND-IMPLEMENTATION-PLAN.md` 已有阶段框架，但与 `PRD.md` / `SDD.md` 的能力映射还不够细，且尚未明确“从计划到执行”的首轮落地边界。需要先补齐计划与验收口径，再启动第一轮实现，避免前端迭代偏离业务主路径。

## What Changes
- 完善 `docs/FRONTEND-IMPLEMENTATION-PLAN.md`，使其与 `PRD`/`SDD` 的页面能力、数据口径、主流程一致
- 明确首轮执行范围为 `Phase 1` 与 `Phase 2` 的最小可用闭环（图标语义统一 + 页面跳转闭环）
- 在现有 `AppShell + pages + hooks/services` 架构下实施，不引入第二套壳层
- 补充路由参数与页面上下文保留策略，减少硬编码默认入口依赖

## Impact
- Affected specs:
  - 前端信息架构与导航语义
  - 页面间主任务流（概览 -> 详情 -> 自选 -> 对比 -> 回测）
  - 可解释性展示路径（详情页结论/趋势/明细/解释）
- Affected code:
  - `docs/FRONTEND-IMPLEMENTATION-PLAN.md`
  - `src/renderer/src/layouts/AppShell.tsx`
  - `src/renderer/src/router/AppRouter.tsx`
  - `src/renderer/src/pages/*.tsx`
  - `src/renderer/src/components/**/*`
  - `src/renderer/src/styles/theme.css`
  - `src/renderer/src/defaults.ts`（如需减少硬编码入口）

## ADDED Requirements
### Requirement: 前端计划与 PRD/SDD 对齐
系统 SHALL 在前端实施计划中明确映射 PRD/SDD 的核心页面与能力边界，并给出可验收的分阶段执行项。

#### Scenario: 计划文档可执行
- **WHEN** 开发者阅读 `FRONTEND-IMPLEMENTATION-PLAN.md`
- **THEN** 能看到每个阶段的目标、范围、产出、验收点，并可直接转为开发任务

### Requirement: 首轮执行闭环（Phase 1 + Phase 2）
系统 SHALL 在首轮实现中完成图标语义统一与主路径页面跳转闭环。

#### Scenario: 从概览进入详情并保留上下文
- **WHEN** 用户在概览页点击股票入口
- **THEN** 应跳转到详情页并带上股票标识（路由参数或等价上下文）

#### Scenario: 从自选到对比到详情闭环
- **WHEN** 用户在自选页选择多只股票进入对比页，并在对比页点击单只股票
- **THEN** 应能完成“自选 -> 对比 -> 详情”连续流转，且返回时不丢失主要上下文

### Requirement: 视觉语义统一
系统 SHALL 保持导航、图标、按钮、状态表达的统一语义，不得出现同义异形或同形异义。

#### Scenario: 一级导航可识别
- **WHEN** 用户查看左侧一级导航
- **THEN** 每个入口都具有一致的“图标 + 文案 + 激活态”表达，并可一眼区分

## MODIFIED Requirements
### Requirement: 前端迭代顺序
系统 SHALL 采用“先主路径闭环，再细节增强”的执行顺序，即优先完成导航语义和跨页流转，再扩展页面深层功能与装饰性细节。

## REMOVED Requirements
### Requirement: 仅静态入口驱动页面访问
**Reason**: 静态默认值入口会阻断真实任务流，无法支撑从列表、对比、回测等场景连续分析。  
**Migration**: 逐步迁移到路由参数或页面上下文驱动；默认值仅作为兜底入口，不作为唯一入口。

