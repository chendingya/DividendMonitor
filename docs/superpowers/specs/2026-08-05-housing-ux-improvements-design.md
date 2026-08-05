# Housing 模块体验改进设计（2026-08-05）

> 基于浏览器预览实测反馈的 4 项改进：已关注筛选、自定义数据总价口径、非 70 城指数空态、指数涨跌幅化。

## 背景

2026-08-04 晚完成 housing 模块 Phase 1（.worktrees/housing @ 057b2e2），8/5 浏览器实测验收时用户反馈 4 个问题：

1. **无已关注入口**：列表页只有「已关注 N 城」计数，无法筛选查看已关注城市。
2. **自定义数据口径错误**：表单录入的是单价（元/㎡），用户实际关心总价（一套房）与整套月租金。
3. **非 70 城指数空白**：常熟等「中指百城独有城市」不在统计局 70 城样本内，`indexSeries` 为空时渲染空白图表，无任何提示。
4. **无累计涨跌幅**：指数走势图只有绝对指数值（100 起），无法直观看出「较某年涨/跌了多少 %」。

## 决策（用户已确认）

| 项 | 决策 |
|---|---|
| 已关注入口 | 列表页加 Segmented「全部 / 已关注」筛选 |
| 自定义单位 | 房价总价（元）+ 整套月租金（元/月） |
| 累计涨跌 | 图表改为相对基准年的涨跌 %，基准年可选，默认 2021 |
| 顶部概览 | 有自定义数据时切换为自定义总值 + 「自定义」标注 |

## A. 已关注筛选（HousingPage）

- 工具条（关键词筛选旁）加 `Segmented`：「全部 / 已关注 (N)」
- 本地过滤：`filteredData` 在关键词过滤基础上叠加 `isWatched` 条件
- 无关注城市时切到「已关注」显示 antd Table 空态提示
- 后端无改动（`isWatched` 已在 `HousingCitySummaryDto`）

## B. 自定义数据总价口径

### 契约（shared/contracts/api.ts）

- `UserHousingDataUpsertDto`：`pricePerSqm` → `priceTotalYuan?: number`（房价总价，元）、`rentPerSqm` → `rentTotalMonthYuan?: number`（整套月租金，元/月）
- `HousingCityDetailDto.userData`：字段同步改名

### 迁移（housingTablesMigration.ts）

- `user_housing_data` 表：DROP COLUMN `price_per_sqm` / `rent_per_sqm`，ADD COLUMN `price_total_yuan REAL` / `rent_total_month_yuan REAL`
- 旧数据（单价口径）无法可靠换算为总价（缺面积信息），迁移时清空该两列数据（当前实际无存量数据）
- 迁移幂等：按列存在性判断（沿用现有 `existing` 表集合风格扩展为列级检查）

### 后端

- `housingRepository`：upsert / findByCity 字段同步
- `housingService.getCityDetail`：
  - `effectivePrice = userData.priceTotalYuan ?? 自动单价`；`effectiveRent = userData.rentTotalMonthYuan ?? 自动单价`
  - 收益率/租售比沿用 `calculateHousingDerivedMetrics`（公式不变：rent × 12 / price）
- `housingRoutes` / `housingChannels`：契约类型自动同步（无逻辑改动）
- mock（`browserRuntimeApi`）：字段同步，`getCityDetail` 补 `userData` 示例

### UI（HousingCityDetailPage）

- 表单 label：`房价总价 (元)` placeholder `如 5000000`；`月租金 (元/月)` placeholder `如 8000`
- 顶部概览：有 `userData` 时显示「房价 500 万」「月租 8,000 元/月」+ Tag「自定义」（`pricePerSqm` 单价 pill 与「租金收益率（自动口径）」语义相应调整）；无自定义时保持自动单价口径
- 新增 `formatTotalYuan(value)`：≥ 10,000 显示 `x.x 万`，否则原值 + 分隔符

## C. 非 70 城指数空态

- `IndexSeriesChart`：`series.length === 0` 时**不初始化 echarts**，渲染提示块：「该城市不在统计局 70 城房价指数样本内，暂无指数数据。可查看上方中指研究院样本均价趋势。」；隐藏「导出图片」按钮与基准年切换
- 「环比涨跌」卡片：`momPercent` 与 `yoyPercent` 均缺失时显示「该城市暂无统计局指数数据（非 70 城样本）」小字提示
- 后端无改动（空数组是正常状态）

## D. 指数涨跌幅化（IndexSeriesChart，纯前端）

- **基准年 Segmented**：选项「2021 / 2018 / 2015 / 起点」，默认 2021（房价历史高点）。选项若超出 series 覆盖范围（如数据从 2011 年起则 2015/2018/2021 均可用；若数据起点晚于某年则该选项禁用）
- **基准锚点**：所选年份的**第一个数据点**指数（`newHomeIndex` 与 `secondHandIndex` 各自取）
- **图表数据**：y 值 = `(index / 基准 − 1) × 100`，保留 1 位小数；y 轴名「累计涨跌幅 (%)」；`splitLine` 0 基准线突出
- **关键数字**（图上方，随基准切换实时更新）：`较 2021-01：新建 −12.3% · 二手 −8.1%`（新建/二手分别取序列最后一个点）
- **tooltip**：显示相对基准涨跌幅（%），保留 1 位小数
- 说明文案更新：「定基指数已停发，此处由月度环比连乘重建。以所选基准月为 0%，展示相对累计涨跌幅。」

## E. 测试

- 纯函数 `computeIndexChangePercent(series, baseDate)`（返回 `{ newHome, secondHand, baseDate }` 与转换后序列）放入 `src/renderer/src/utils/housingCalc.ts`
- `formatTotalYuan` 同文件
- 测试：`tests/renderer/housingCalc.test.ts`
  - 基准日等于首点 → 首点 0%
  - 中间基准 → 前后符号正确
  - 基准不存在（早于序列）→ 回退到起点
  - 空序列 → 空结果
  - formatTotalYuan 万/非万边界
- 全量 `npm test` + `npm run typecheck`

## 验收标准

1. 房产列表页可切「已关注」筛选，关注/取消后计数与列表实时一致
2. 自定义数据按总价/月租录入，保存后顶部显示「房价 x 万 · 月租 x 元/月」+ 自定义标签，收益率按总价重算；刷新后回填
3. 常熟等非 70 城城市详情页显示空态提示而非空白图表
4. 北京等 70 城指数图默认显示较 2021-01 涨跌幅，切换基准年曲线与关键数字联动
