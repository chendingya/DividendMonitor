# 收息佬目录简化计划

## 1. 背景

当前工程已经具备分层边界，但首期规模还不大，目录层级开始出现“职责清晰但跳转过深”的问题，主要体现在：

1. 渲染层存在 `app -> layouts/router`、`containers`、`features/*/components`、`services/api` 多层跳转
2. 很多页面只是薄薄一层 `Page -> Container -> Feature Component`
3. 主进程已经明确只保留真实数据源，但目录里仍残留 `mock/`
4. `adapters/contracts/` 这种二级目录对当前体量来说偏重

简化目标不是打散分层，而是在保留职责边界的前提下，减少无效目录层级。

## 2. 简化原则

1. 保留主进程分层：`application / domain / repositories / adapters / infrastructure / ipc`
2. 优先简化渲染层，不把业务逻辑重新塞回 UI 基础组件
3. 删除已明确不用的 `mock` 代码和相关心智负担
4. 合并“只有一层转发价值”的目录，不做大规模职责重写
5. 一次只做一轮小重构，保证每轮后都能通过类型检查

## 3. 目标目录

### 3.1 主进程目标目录

```text
src/main/
  adapters/
    AShareDataSource.ts
    eastmoney/
      eastmoneyAShareDataSource.ts
      eastmoneyUtils.ts
    index.ts
  application/
    useCases/
  domain/
    entities/
    services/
  infrastructure/
    config/
    http/
  ipc/
    channels/
  repositories/
    stockRepository.ts
  index.ts
```

说明：

1. 保留主进程分层，不继续下沉更多目录
2. `AShareDataSource` 提升到 `adapters/` 根目录
3. 删除 `mock/` 目录

### 3.2 渲染层目标目录

```text
src/renderer/src/
  layouts/
    AppShell.tsx
  router/
    AppRouter.tsx
  pages/
    DashboardPage.tsx
    StockDetailPage.tsx
    WatchlistPage.tsx
    ComparisonPage.tsx
    BacktestPage.tsx
  components/
    app/
      AppCard.tsx
      LedgerUi.tsx
    stock-detail/
      FutureYieldEstimateCard.tsx
      DividendYieldChart.tsx
    watchlist/
      WatchlistTable.tsx
    comparison/
      ComparisonTable.tsx
    backtest/
      BacktestSummaryCard.tsx
  hooks/
    useStockDetail.ts
    useWatchlist.ts
    useComparison.ts
    useBacktest.ts
  services/
    desktopApi.ts
    stockApi.ts
    watchlistApi.ts
    calculationApi.ts
  styles/
    theme.css
  App.tsx
  main.tsx
```

说明：

1. `app/` 拆平为 `layouts/` 和 `router/`
2. 移除 `containers/`，由页面直接调用 hook 并组合业务组件
3. `features/*/components` 收拢到 `components/<feature>/`
4. `services/api/` 收拢到 `services/`

## 4. 不做的事情

本轮不做以下事项：

1. 不把 `application/useCases` 再次扁平化
2. 不改 IPC 协议命名
3. 不重写现有领域模型
4. 不在本轮引入 Zustand、React Query 或新的状态方案
5. 不为了“更简洁”而去掉主进程与渲染进程的职责边界

## 5. 执行计划

### Phase 1

1. 更新文档
2. 主进程移除 `mock`
3. `AShareDataSource.ts` 提升到 `src/main/adapters/`
4. 修正所有主进程 import

### Phase 2

1. 渲染层 `app/layouts` 移到 `layouts`
2. 渲染层 `app/router` 移到 `router`
3. `services/api` 收拢到 `services`

### Phase 3

1. 删除 `containers/`
2. 页面直接接入 hook
3. `features/*/components` 收拢到 `components/<feature>/`

### Phase 4

1. 清理空目录
2. 全量 `typecheck`
3. 检查最近修改文件的诊断

## 6. 判断标准

如果本轮重构完成后满足以下条件，则认为简化有效：

1. 新同学能在 1 分钟内找到页面入口、数据入口和核心组件
2. 打开任意页面时，常见阅读路径不超过 3 层目录跳转
3. 仍然保持 `UI -> hook/service -> preload -> use case -> repository -> adapter` 这一主链路
4. `mock` 不再出现在运行链路和目录结构中
