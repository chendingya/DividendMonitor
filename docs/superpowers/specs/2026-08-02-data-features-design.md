# 设计文档：备份恢复 / 图表导出 / 数据更新时间提示

- 日期：2026-08-02
- 范围：PRD §8.2 未实现项（图表导出和截图、数据更新时间提示）+ Phase 4 备份恢复
- 关联文档：`docs/PRD.md`、`docs/SDD.md`、`docs/HTTP-API.md`

## 1. 背景与目标

| 功能 | 用户选择方案 | 现状 |
|------|-------------|------|
| 备份恢复 | 本地文件整库备份（复制 SQLite 文件，恢复时整库覆盖） | 无任何备份能力；`getDatabase()` 单例无 close 支持 |
| 图表导出 | PNG 图表（6 图）+ 详情页股息率表 CSV | 9 个 ECharts 组件中 6 个实例为 effect 局部变量；CSV 范式已在 DashboardPage 存在 |
| 数据更新时间提示 | 详情页头部（fetched_at）+ 工作台/自选页（最近刷新） | `fetched_at` 完全不出主进程，renderer 拿不到任何时间戳 |

## 2. §1 备份恢复（本地文件整库）

### 2.1 能力边界

- **仅桌面模式（Electron IPC）支持**；浏览器预览模式（mock / HTTP）抛"不支持"错误
- 备份 = 复制整个 SQLite 库文件到用户选择位置；恢复 = 选择备份文件后整库覆盖
- 恢复前自动创建安全备份（原库复制为 `pre-restore-<ts>.sqlite` 同目录），防止误覆盖
- 恢复后无需重启进程：`closeDatabase()` 关闭单例连接，后续 `getDatabase()` 惰性重建（所有 repository 均每次调用 `getDatabase()` 取连接，重建安全）

### 2.2 主进程改动

**`src/main/infrastructure/db/sqlite.ts`**：
- 新增 `export function closeDatabase(): void` — `database?.close(); database = null`（close 前无进行中事务——由调用方保证）
- 新增 `export function getDatabaseFilePath(): string`（现有私有 `getDatabaseFilePath` 提升为导出，供备份复制使用）

**新建 `src/main/ipc/channels/backupChannels.ts`**（仿 settingsChannels.ts 模式）：
- `backup:create`：`dialog.showSaveDialog({ defaultPath: dividend-monitor-backup-<ts>.sqlite, filters: [{ name: 'SQLite 数据库', extensions: ['sqlite'] }] })` → 取消则返回 `{ canceled: true }` → `copyFile(dbPath, destPath)` → 返回 `{ canceled: false, path, size }`
- `backup:restore`：`dialog.showOpenDialog({ filters: [sqlite] })` → 取消返回 `{ canceled: true }` → 校验文件存在 → 创建安全备份 `pre-restore-<ts>.sqlite` → `closeDatabase()` → `copyFile(backupPath, dbPath)` → 返回 `{ canceled: false, restored: true }`（不主动重开连接，下次 getDatabase 惰性重建）
- 复制逻辑抽纯函数 `copyFile(src, dest)`（fs.copyFileSync）便于单测

**`shared/contracts/api.ts`**：`DividendMonitorApi` 增加命名空间：
```ts
backup: {
  createBackup(): Promise<{ canceled: boolean; path?: string; size?: number }>
  restoreBackup(): Promise<{ canceled: boolean; restored?: boolean }>
}
```

**`src/preload/index.ts`**：`api.backup` 实现（invoke `backup:create` / `backup:restore`）

**`src/main/ipc/channels/index.ts`**：注册 `registerBackupChannels()`

**`src/renderer/src/services/browserRuntimeApi.ts`**（mock）：`backup` 命名空间方法抛错 `'浏览器预览模式不支持备份恢复'`

**`src/renderer/src/services/browserHttpRuntimeApi.ts`**（HTTP）：同上抛错

**新建 `src/renderer/src/services/backupApi.ts`**：`getBackupDesktopApi()` 封装

### 2.3 UI 入口

设置页（`SettingsPage.tsx`）新增"数据备份"区块（AppCard）：
- 按钮"导出备份"（调用 createBackup，成功 message 显示路径与大小；取消不提示）
- 按钮"恢复备份"（Modal.confirm 强提示"将覆盖全部本地数据（自选/持仓/设置/分红/回测历史），且不影响云端数据，确认继续？"→ restoreBackup → 成功 message 提示 + 页面刷新）
- 说明文案：备份为本地 SQLite 完整副本；浏览器预览模式不可用

## 3. §2 图表 PNG 导出 + 表格 CSV

### 3.1 通用工具（新建 `src/renderer/src/components/app/chartExport.ts`）

```ts
export function exportChartAsPng(instance: echarts.ECharts | null, filename: string): void
// getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }) → a[download] → revoke
export function exportRowsAsCsv(rows: Array<Record<string, unknown>>, filename: string): void
// BOM(UTF-8) + 逗号分隔 + 引号转义；复用 DashboardPage exportReport 范式（L456-516）
```

### 3.2 导出按钮组件（新建 `src/renderer/src/components/app/ChartExportButton.tsx`）

```tsx
<ChartExportButton instanceRef={instanceRef} filename="price-trend" />
// antd Button size="small" type="text" icon={<DownloadOutlined />} title="导出图片"
// 渲染为图表容器右上角悬浮按钮（absolute 定位，父容器 relative）
```

### 3.3 六个图表组件改造（加 instanceRef + 导出按钮）

| 组件 | 文件 | 导出文件名 |
|------|------|-----------|
| PriceTrendChart | `components/stock-detail/PriceTrendChart.tsx` | `price-trend-<code>` |
| ValuationTrendChart | `components/stock-detail/ValuationTrendChart.tsx` | `valuation-trend-<code>` |
| YearlyDividendTrendChart | `components/stock-detail/YearlyDividendTrendChart.tsx` | `yearly-dividend-trend-<code>` |
| BacktestNavChart | `components/backtest/BacktestNavChart.tsx` | `backtest-nav-<symbol>` |
| DividendBarChart | `pages/DividendCenterPage.tsx`（内联） | `dividend-yearly-summary` |
| DividendTrendChart | `pages/DividendCenterPage.tsx`（内联） | `dividend-monthly-trend` |

改造要点：effect 内 `instanceRef.current = chart`；容器 div 加 `position: relative`；渲染 ChartExportButton。

### 3.4 表格 CSV（详情页）

`StockDetailPage.tsx` 现金分配历史 AppCard 标题（L454）加"导出 CSV"按钮：
- 数据：`sortedDividendEvents` 映射为行（自然年/除息日/派息日/每股分红/类型/单次股息率，股息率 = dividendPerShare / referenceClosePrice 百分比）
- 文件名：`dividend-history-<code>.csv`

## 4. §3 数据更新时间提示

### 4.1 详情页（真实数据时间 fetched_at）

**主进程贯通**：
- `shared/contracts/api.ts`：`AssetDetailDto` 增加 `fetchedAt?: string`（ISO）
- `getAssetDetail` useCase（`src/main/application/useCases/getAssetDetail.ts`）：获取 DTO 后从 `assetSnapshotRepository.findByKey(assetKey)` 读 `fetchedAt` 拼入（新抓取路径 upsert 后立即 findByKey 即当前时间；缓存路径为快照写入时间）
- `toAssetDetailDto` mapper（`stockDtoMappers.ts`）：增加 `fetchedAt` 参数/字段透传

**UI**：`StockDetailPage.tsx` 头部价格区（L186 `最新价 / 资产类型` span 附近）追加小字：`数据更新于 {formatDateTime(fetchedAt)}`（fetchedAt 缺失时不显示）；格式化工具新建 `src/renderer/src/utils/format.ts`（`formatDateTime(iso: string): string` → `YYYY-MM-DD HH:mm`）

### 4.2 工作台 / 自选页（本地刷新时间）

- `DashboardPage.tsx`：新增 `refreshedAt: Date | null` state；`refreshQuotes` 成功后 `setRefreshedAt(new Date())`；初始数据加载完成后也设置一次；在 `DashboardHero` 刷新按钮附近显示 `最近刷新 HH:mm:ss`（antd Typography.Text type="secondary"）
- `WatchlistPage.tsx`：`refreshWatchlist` 成功后记录 `refreshedAt` state，在"刷新自选"按钮附近显示同样格式

## 5. 测试策略

- `closeDatabase()`：现有 `dbMigration.test.ts` 模式（vi.mock electron app）——新增 `closeDatabase` 后 `getDatabase()` 重新打开验证（临时文件路径）
- 备份纯函数 `copyFile`：临时目录复制测试（`tests/main/backup/copyFile.test.ts`）
- `exportRowsAsCsv`：纯函数单测（BOM 头、逗号转义、引号转义、文件名）——`tests/renderer/chartExport.test.ts`（renderer 现有测试即纯函数模式）
- fetchedAt 贯通：`getAssetDetail` 相关单测（mock snapshot repository）或 mapper 测试
- 图表导出按钮/UI：不写渲染测试（无 jsdom），靠 typecheck + MCP 端到端验收

## 6. 端到端验证（MCP，必做）

| 功能 | 验证动作 | 通过标准 |
|------|---------|---------|
| 备份 | 桌面模式点"导出备份"→ 选择路径 | 生成 .sqlite 文件，大小 >0，message 显示路径 |
| 恢复 | 修改本地数据（如加一条自选）→ 恢复旧备份 → 重启查看 | 数据回滚到备份时状态 |
| 图表导出 | 详情页/回测/分红中心 6 图逐个点导出 | 下载 PNG 且能打开（文件大小 >10KB） |
| CSV | 详情页股息率表导出 | 下载 CSV，Excel 打开中文不乱码（BOM 验证） |
| 时间提示 | 详情页加载 | 显示"数据更新于 xx"且时间合理；工作台/自选刷新按钮后时间更新 |

**最终验收门槛**：`npm run typecheck` ✓ + `npm test` ✓ + 上表 MCP 端到端 ✓

## 7. 非目标（明确不做）

- 备份推送 Supabase 云端 / 结构化 JSON 按表导出（用户选本地整库文件）
- 其他图表组件（PortfolioDistributionPie / IndustryDistributionPie / CorrelationMatrix / IndexValuationTrendChart）加导出按钮（范围外，后续按需）
- 全局页脚/每个数据块的细粒度时间提示（用户选详情页 + 列表页）
- 恢复时暂停后台同步服务（风险可接受，恢复后数据一致性由下次同步兜底）
- 备份文件加密
