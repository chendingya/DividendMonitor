# 备份恢复 / 图表导出 / 数据更新时间提示 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三个 PRD 未完成项：本地文件整库备份/恢复（桌面模式）、6 个 ECharts 图表 PNG 导出 + 详情页股息率表 CSV 导出、数据更新时间提示（详情页 fetched_at + 工作台/自选页最近刷新）。

**Architecture:** 三个独立 Phase 顺序执行（A 备份恢复 → B 图表导出 → C 时间提示 → D 最终验收）。备份恢复走 Electron IPC + dialog（仅桌面），浏览器预览模式抛错；图表导出为纯 renderer 能力（echarts getDataURL + Blob 下载，复用 DashboardPage 既有 CSV 范式）；时间提示贯通 `asset_snapshots.fetched_at` → `AssetDetailDto.fetchedAt`。

**Tech Stack:** Electron 35（dialog/IPC）、node:sqlite（DatabaseSync.close）、React 18 + antd 5 + echarts 5、Vitest 4（node 环境，renderer 仅纯函数测试）。

**Spec:** `docs/superpowers/specs/2026-08-02-data-features-design.md`

## Global Constraints

- 备份恢复**仅桌面模式（IPC）**；浏览器预览（mock/HTTP fallback）方法抛错 `'浏览器预览模式不支持备份恢复'`
- 恢复前必须自动创建安全备份 `pre-restore-<ts>.sqlite`（原库同目录）；恢复后 `closeDatabase()` 重建连接，不要求进程重启
- 图表导出文件名固定为组件内常量（不扩展组件 props 传 code，YAGNI）：`price-trend` / `valuation-trend` / `yearly-dividend-trend` / `backtest-nav` / `dividend-yearly-summary` / `dividend-monthly-trend`；CSV 文件名 `dividend-history`
- CSV 必须带 UTF-8 BOM（Excel 中文不乱码），复用 DashboardPage `exportReport` 范式（`Uint8Array([0xef,0xbb,0xbf])` + `TextEncoder` + `Blob` + `a[download]`）
- `fetchedAt` 为可选字段（`AssetDetailDto.fetchedAt?: string`），前端缺失时不显示时间提示
- 提交信息遵循 conventional commits（中文），不加 Co-Authored-By
- 每个任务完成后 `npm run typecheck` + 相关测试通过才提交；渲染层 UI 无单测（node 环境），靠 typecheck + MCP 端到端

---

# Phase A：备份恢复

## Task A1: sqlite.ts 增加 closeDatabase() 与 getDatabaseFilePath 导出

**Files:**
- Modify: `src/main/infrastructure/db/sqlite.ts`
- Test: `tests/main/infrastructure/sqliteClose.test.ts`

**Interfaces:**
- Produces: `export function closeDatabase(): void`（关闭单例连接并置 null）、`export function getDatabaseFilePath(): string`（现有私有函数提升导出）

- [x] **Step 1: 写失败测试**

创建 `tests/main/infrastructure/sqliteClose.test.ts`：

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const tempDir = mkdtempSync(join(tmpdir(), 'sqlite-close-'))
const userDataDir = join(tempDir, 'userdata')

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}))

const sqlite = await import('@main/infrastructure/db/sqlite')

describe('sqlite close/reopen', () => {
  beforeEach(() => {
    sqlite.closeDatabase()
  })

  afterAll(() => {
    sqlite.closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('getDatabase creates a file and closeDatabase releases it', () => {
    const db = sqlite.getDatabase()
    db.prepare('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)').run()
    const filePath = sqlite.getDatabaseFilePath()
    expect(filePath).toContain('dividend-monitor.sqlite')

    sqlite.closeDatabase()
    expect(() => {
      db.prepare('SELECT 1').get()
    }).toThrow()
  })

  it('getDatabase reopens the same file after closeDatabase with data intact', () => {
    const db = sqlite.getDatabase()
    db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)')
    db.prepare('INSERT INTO t (id) VALUES (1)').run()
    sqlite.closeDatabase()

    const reopened = sqlite.getDatabase()
    const row = reopened.prepare('SELECT id FROM t').get() as { id: number }
    expect(row.id).toBe(1)
  })
})
```

注意：测试使用 `await import` 加载模块（mock electron 生效后再 import）。sqlite.ts 的 `initializeSchema` 会跑全部迁移，在临时目录上应正常执行（迁移均为幂等 CREATE/ALTER 守卫）。

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/infrastructure/sqliteClose.test.ts`
Expected: FAIL — `closeDatabase is not a function` / `getDatabaseFilePath is not a function`

- [x] **Step 3: 最小实现**

修改 `src/main/infrastructure/db/sqlite.ts`：

- 将私有 `getDatabaseFilePath` 改为导出（删除 `function` 前的 `function` 声明位置不动，仅在 `function` 前加 `export`）：

```ts
export function getDatabaseFilePath() {
  return join(app.getPath('userData'), 'db', 'dividend-monitor.sqlite')
}
```

- 在 `getDatabase()` 函数之后追加：

```ts
export function closeDatabase(): void {
  if (!database) {
    return
  }
  database.close()
  database = null
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/infrastructure/sqliteClose.test.ts`
Expected: PASS（2 个用例）

- [x] **Step 5: 全量回归 + 提交**

Run: `npx vitest run`
Expected: 全部 PASS（既有测试不受影响）

```bash
git add src/main/infrastructure/db/sqlite.ts tests/main/infrastructure/sqliteClose.test.ts
git commit -m "feat(db): 新增 closeDatabase 与 getDatabaseFilePath 导出（备份恢复基础）"
```

---

## Task A2: 备份文件服务（copyFile 纯函数）

**Files:**
- Create: `src/main/backup/backupFileService.ts`
- Test: `tests/main/backup/backupFileService.test.ts`

**Interfaces:**
- Consumes: 无（纯 node:fs）
- Produces: `export function copySqliteFile(source: string, destination: string): void`（copyFileSync，抛错向上传递）；`export function buildBackupFileName(now: Date): string`（`dividend-monitor-backup-YYYY-MM-DDTHH-mm-ss.sqlite`，ISO 去冒号）；`export function buildPreRestoreFileName(now: Date): string`（`pre-restore-YYYY-MM-DDTHH-mm-ss.sqlite`）

- [x] **Step 1: 写失败测试**

创建 `tests/main/backup/backupFileService.test.ts`：

```ts
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildBackupFileName, buildPreRestoreFileName, copySqliteFile } from '@main/backup/backupFileService'

const tempDir = mkdtempSync(join(tmpdir(), 'backup-svc-'))

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('backupFileService', () => {
  it('copies a file to destination', () => {
    const source = join(tempDir, 'src.sqlite')
    const dest = join(tempDir, 'dest.sqlite')
    writeFileSync(source, 'file-content-123')

    copySqliteFile(source, dest)

    expect(readFileSync(dest, 'utf8')).toBe('file-content-123')
  })

  it('throws when source is missing', () => {
    expect(() => copySqliteFile(join(tempDir, 'missing.sqlite'), join(tempDir, 'out.sqlite'))).toThrow()
  })

  it('builds backup file name from timestamp without colons', () => {
    const name = buildBackupFileName(new Date('2026-08-02T10:30:45.000Z'))
    expect(name).toBe('dividend-monitor-backup-2026-08-02T10-30-45.sqlite')
  })

  it('builds pre-restore file name from timestamp', () => {
    const name = buildPreRestoreFileName(new Date('2026-08-02T10:30:45.000Z'))
    expect(name).toBe('pre-restore-2026-08-02T10-30-45.sqlite')
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/backup/backupFileService.test.ts`
Expected: FAIL — "Failed to resolve import"

- [x] **Step 3: 最小实现**

创建 `src/main/backup/backupFileService.ts`：

```ts
import { copyFileSync } from 'node:fs'

export function copySqliteFile(source: string, destination: string): void {
  copyFileSync(source, destination)
}

function formatTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export function buildBackupFileName(now: Date): string {
  return `dividend-monitor-backup-${formatTimestamp(now)}.sqlite`
}

export function buildPreRestoreFileName(now: Date): string {
  return `pre-restore-${formatTimestamp(now)}.sqlite`
}
```

注意：`2026-08-02T10:30:45.000Z` 的 ISO 含毫秒 `.000`，`replace(/[:.]/g,'-')` 后为 `2026-08-02T10-30-45-000`，`slice(0,19)` 截为 `2026-08-02T10-30-45` ✓

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/backup/backupFileService.test.ts`
Expected: PASS（4 个用例）

- [x] **Step 5: 提交**

```bash
git add src/main/backup/backupFileService.ts tests/main/backup/backupFileService.test.ts
git commit -m "feat(backup): 备份文件服务（文件复制与命名）"
```

---

## Task A3: backup IPC 通道 + 合约 + preload

**Files:**
- Create: `src/main/ipc/channels/backupChannels.ts`
- Modify: `src/main/ipc/channels/index.ts`
- Modify: `shared/contracts/api.ts`（`DividendMonitorApi` 增加 `backup` 命名空间）
- Modify: `src/preload/index.ts`（api.backup 实现）

**Interfaces:**
- Consumes: `closeDatabase` / `getDatabaseFilePath`（Task A1）、`copySqliteFile` / `buildBackupFileName` / `buildPreRestoreFileName`（Task A2）
- Produces: IPC 通道 `backup:create` / `backup:restore`；合约类型：

```ts
backup: {
  createBackup(): Promise<{ canceled: boolean; path?: string; size?: number }>
  restoreBackup(): Promise<{ canceled: boolean; restored?: boolean }>
}
```

- [x] **Step 1: 扩展 shared 合约**

在 `shared/contracts/api.ts` 的 `DividendMonitorApi` interface 内（如 `settings` 命名空间附近）增加：

```ts
    backup: {
      createBackup(): Promise<{ canceled: boolean; path?: string; size?: number }>
      restoreBackup(): Promise<{ canceled: boolean; restored?: boolean }>
    }
```

- [x] **Step 2: 实现 backupChannels.ts**

创建 `src/main/ipc/channels/backupChannels.ts`：

```ts
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { closeDatabase, getDatabaseFilePath } from '@main/infrastructure/db/sqlite'
import { buildBackupFileName, buildPreRestoreFileName, copySqliteFile } from '@main/backup/backupFileService'

const SQLITE_FILTER = [{ name: 'SQLite 数据库', extensions: ['sqlite'] }]

export function registerBackupChannels(): void {
  ipcMain.handle('backup:create', async () => {
    const window = BrowserWindow.getFocusedWindow() ?? undefined
    const now = new Date()
    const result = await dialog.showSaveDialog(window, {
      title: '导出数据备份',
      defaultPath: buildBackupFileName(now),
      filters: SQLITE_FILTER
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    const dbPath = getDatabaseFilePath()
    copySqliteFile(dbPath, result.filePath)
    const size = statSync(result.filePath).size
    return { canceled: false, path: result.filePath, size }
  })

  ipcMain.handle('backup:restore', async () => {
    const window = BrowserWindow.getFocusedWindow() ?? undefined
    const result = await dialog.showOpenDialog(window, {
      title: '选择要恢复的备份文件',
      filters: SQLITE_FILTER,
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const backupPath = result.filePaths[0]
    const dbPath = getDatabaseFilePath()

    // 恢复前自动创建安全备份，防止误覆盖
    const preRestorePath = join(dirname(dbPath), buildPreRestoreFileName(new Date()))
    copySqliteFile(dbPath, preRestorePath)

    closeDatabase()
    copySqliteFile(backupPath, dbPath)

    return { canceled: false, restored: true }
  })
}
```

- [x] **Step 3: 注册通道**

在 `src/main/ipc/channels/index.ts` 中导入并注册（仿既有通道，如 `registerSettingsChannels`）：

```ts
import { registerBackupChannels } from '@main/ipc/channels/backupChannels'
// registerIpcHandlers 内追加：
registerBackupChannels()
```

- [x] **Step 4: preload 暴露**

在 `src/preload/index.ts` 的 `api` 对象中（settings 命名空间附近）增加：

```ts
    backup: {
      createBackup: () => ipcRenderer.invoke('backup:create'),
      restoreBackup: () => ipcRenderer.invoke('backup:restore')
    },
```

（若 preload 的 invoke 经 `unwrapIpc` 包装，则按现有 `settings.get` 的写法 `unwrapIpc(ipcRenderer.invoke('backup:create'))` 保持一致。）

- [x] **Step 5: 验证编译**

Run: `npm run typecheck`
Expected: 无错误

- [x] **Step 6: 提交**

```bash
git add src/main/ipc/channels/backupChannels.ts src/main/ipc/channels/index.ts shared/contracts/api.ts src/preload/index.ts
git commit -m "feat(backup): 备份/恢复 IPC 通道与 preload 暴露"
```

---

## Task A4: renderer 备份服务与 fallback

**Files:**
- Create: `src/renderer/src/services/backupApi.ts`
- Modify: `src/renderer/src/services/browserRuntimeApi.ts`（mock fallback 增加 backup 命名空间抛错）
- Modify: `src/renderer/src/services/browserHttpRuntimeApi.ts`（HTTP fallback 同上）
- Modify: `src/renderer/src/services/desktopApi.ts`（getBackupDesktopApi）

**Interfaces:**
- Consumes: `DividendMonitorApi.backup` 合约（Task A3）
- Produces: `export function getBackupDesktopApi(): DividendMonitorApi['backup']`；两个 fallback 中 backup 方法 `throw new Error('浏览器预览模式不支持备份恢复')`

- [x] **Step 1: 实现 desktopApi 入口**

在 `src/renderer/src/services/desktopApi.ts` 中按既有模式追加：

```ts
export function getBackupDesktopApi(): DividendMonitorApi['backup'] {
  return getRuntimeApi().backup
}
```

- [x] **Step 2: 实现 backupApi.ts**

创建 `src/renderer/src/services/backupApi.ts`：

```ts
import { getBackupDesktopApi } from '@renderer/services/desktopApi'

export const backupApi = getBackupDesktopApi()
```

- [x] **Step 3: 两个 fallback 抛错**

在 `src/renderer/src/services/browserRuntimeApi.ts` 与 `src/renderer/src/services/browserHttpRuntimeApi.ts` 的 runtime 对象中各加（放在与 `settings` 同级的位置，满足 `DividendMonitorApi` 类型完整性）：

```ts
  backup: {
    createBackup: async () => {
      throw new Error('浏览器预览模式不支持备份恢复')
    },
    restoreBackup: async () => {
      throw new Error('浏览器预览模式不支持备份恢复')
    }
  },
```

（具体插入位置以两文件的 runtime 对象结构为准，typecheck 报缺字段时按报错补齐。）

- [x] **Step 4: 验证编译**

Run: `npm run typecheck`
Expected: 无错误（若 typecheck 报 backup 缺失，说明还有遗漏的 DividendMonitorApi 实现点，补齐）

- [x] **Step 5: 提交**

```bash
git add src/renderer/src/services/backupApi.ts src/renderer/src/services/desktopApi.ts src/renderer/src/services/browserRuntimeApi.ts src/renderer/src/services/browserHttpRuntimeApi.ts
git commit -m "feat(backup): 渲染层备份服务入口与浏览器预览 fallback"
```

---

## Task A5: 设置页备份 UI

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `backupApi`（Task A4）
- Produces: 设置页"数据备份"区块（导出备份 / 恢复备份按钮 + 说明文案 + Modal.confirm 强提示）

- [x] **Step 1: 实现 UI 区块**

在 `src/renderer/src/pages/SettingsPage.tsx` 的返回 JSX 中（最后一个设置区块之后）增加：

```tsx
      <AppCard title="数据备份">
        <p style={{ color: '#66707a', fontSize: 13, marginBottom: 12 }}>
          备份为本地 SQLite 完整副本（自选、持仓、设置、分红记录与回测历史）。
          恢复将覆盖全部本地数据；云端数据不受影响。
        </p>
        <Space>
          <Button onClick={handleBackup}>导出备份</Button>
          <Button danger onClick={handleRestore}>恢复备份</Button>
        </Space>
      </AppCard>
```

在组件内新增两个函数（import `backupApi`、`Modal`）：

```tsx
  async function handleBackup() {
    try {
      const result = await backupApi.createBackup()
      if (!result.canceled && result.path) {
        void message.success(`已导出备份：${result.path}`)
      }
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '导出备份失败')
    }
  }

  function handleRestore() {
    Modal.confirm({
      title: '恢复备份将覆盖全部本地数据',
      content: '自选、持仓、设置、分红记录与回测历史都会被替换为备份中的内容。恢复前会先自动保留当前数据的安全备份。确认继续？',
      okText: '确认恢复',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const result = await backupApi.restoreBackup()
          if (result.canceled) {
            return
          }
          void message.success('已恢复备份，正在刷新页面')
          window.location.reload()
        } catch (err) {
          void message.error(err instanceof Error ? err.message : '恢复备份失败')
        }
      }
    })
  }
```

- [x] **Step 2: 验证编译 + 回归**

Run: `npm run typecheck` → 无错误
Run: `npx vitest run` → 全量通过

- [x] **Step 3: 提交**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(ui): 设置页新增数据备份与恢复入口"
```

---

# Phase B：图表导出

## Task B1: chartExport 工具（CSV 纯函数 + 下载）

**Files:**
- Create: `src/renderer/src/utils/chartExport.ts`
- Test: `tests/renderer/chartExport.test.ts`

**Interfaces:**
- Produces: `export function buildCsv(rows: Array<Record<string, unknown>>): string`（纯函数：表头 = 首行键，逗号分隔，含 `,`/`"`/换行的值加引号并转义 `""`，换行 `\n`）；`export function exportRowsAsCsv(rows: Array<Record<string, unknown>>, filename: string): void`（BOM + Blob + a[download]，无行时直接返回）；`export function exportChartAsPng(instance: echarts.ECharts | null, filename: string): void`（getDataURL pixelRatio 2 backgroundColor '#fff' → a[download]）

- [x] **Step 1: 写失败测试**

创建 `tests/renderer/chartExport.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildCsv } from '@renderer/utils/chartExport'

describe('buildCsv', () => {
  it('builds header row from first row keys', () => {
    const csv = buildCsv([{ name: 'A', value: 1 }])
    expect(csv.split('\n')[0]).toBe('name,value')
  })

  it('joins values in order of header keys', () => {
    const csv = buildCsv([
      { name: 'A', value: 1 },
      { name: 'B', value: 2 }
    ])
    expect(csv.split('\n')[1]).toBe('A,1')
    expect(csv.split('\n')[2]).toBe('B,2')
  })

  it('quotes values containing comma, quote or newline', () => {
    const csv = buildCsv([{ text: 'a,b', quote: 'say "hi"', multi: 'line1\nline2' }])
    const line = csv.split('\n')[1]
    expect(line).toBe('"a,b","say ""hi""","line1\nline2"')
  })

  it('renders null and undefined as empty', () => {
    const csv = buildCsv([{ a: null, b: undefined, c: 0 }])
    expect(csv.split('\n')[1]).toBe(',,0')
  })

  it('returns empty string for empty rows', () => {
    expect(buildCsv([])).toBe('')
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/chartExport.test.ts`
Expected: FAIL — "Failed to resolve import"

- [x] **Step 3: 最小实现**

创建 `src/renderer/src/utils/chartExport.ts`：

```ts
import * as echarts from 'echarts'

export function buildCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return ''
  }

  const header = Object.keys(rows[0])
  const escape = (value: unknown): string => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const lines = [
    header.join(','),
    ...rows.map((row) => header.map((key) => escape(row[key])).join(','))
  ]
  return lines.join('\n')
}

export function exportRowsAsCsv(rows: Array<Record<string, unknown>>, filename: string): void {
  if (rows.length === 0) {
    return
  }

  const csv = buildCsv(rows)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, new TextEncoder().encode(csv)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function exportChartAsPng(instance: echarts.ECharts | null, filename: string): void {
  if (!instance) {
    return
  }

  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.png`
  anchor.click()
}
```

注意：`buildCsv` 的引号用例——`String(value ?? '')` 后 `/[",\n]/` 检测；`"a,b"` 等转义正确。`multi` 值含换行 → 整个值被引号包裹且 CSV 行内换行（测试断言行首尾引号包裹整个多行值）。

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/chartExport.test.ts`
Expected: PASS（5 个用例）

- [x] **Step 5: 提交**

```bash
git add src/renderer/src/utils/chartExport.ts tests/renderer/chartExport.test.ts
git commit -m "feat(export): 图表 PNG 与表格 CSV 导出工具"
```

---

## Task B2: ChartExportButton 组件 + 详情页/回测图表改造

**Files:**
- Create: `src/renderer/src/components/app/ChartExportButton.tsx`
- Modify: `src/renderer/src/components/stock-detail/PriceTrendChart.tsx`
- Modify: `src/renderer/src/components/stock-detail/ValuationTrendChart.tsx`
- Modify: `src/renderer/src/components/stock-detail/YearlyDividendTrendChart.tsx`
- Modify: `src/renderer/src/components/backtest/BacktestNavChart.tsx`

**Interfaces:**
- Consumes: `exportChartAsPng`（Task B1）
- Produces: `export function ChartExportButton(props: { instanceRef: React.MutableRefObject<echarts.ECharts | null>; filename: string }): JSX.Element`（右上角悬浮小按钮）；四个图表组件增加 `instanceRef` 与按钮

- [x] **Step 1: 创建 ChartExportButton**

创建 `src/renderer/src/components/app/ChartExportButton.tsx`：

```tsx
import { DownloadOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import type { MutableRefObject } from 'react'
import type * as echarts from 'echarts'
import { exportChartAsPng } from '@renderer/utils/chartExport'

type ChartExportButtonProps = {
  instanceRef: MutableRefObject<echarts.ECharts | null>
  filename: string
}

export function ChartExportButton({ instanceRef, filename }: ChartExportButtonProps) {
  return (
    <Tooltip title="导出图片">
      <button
        type="button"
        onClick={() => exportChartAsPng(instanceRef.current, filename)}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(171, 173, 175, 0.4)',
          borderRadius: 6,
          background: 'rgba(255, 255, 255, 0.9)',
          color: '#66707a',
          cursor: 'pointer'
        }}
      >
        <DownloadOutlined />
      </button>
    </Tooltip>
  )
}
```

注意：项目是否依赖 `@ant-design/icons`？检查 package.json——若未安装，改用内联 SVG 图标（参考 DashboardHero 的 svg 写法）：

```tsx
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
</svg>
```

- [x] **Step 2: PriceTrendChart 改造**

`src/renderer/src/components/stock-detail/PriceTrendChart.tsx`：

- 增加 `const instanceRef = useRef<echarts.ECharts | null>(null)`
- effect 内 `const chart = echarts.init(chartRef.current)` 之后加 `instanceRef.current = chart`；cleanup 里 `chart.dispose()` 之后加 `instanceRef.current = null`
- 图表容器 div 改为：

```tsx
      <div ref={chartRef} style={{ width: '100%', height: 320, position: 'relative' }}>
        <ChartExportButton instanceRef={instanceRef} filename="price-trend" />
      </div>
```

- import 增加 `ChartExportButton`

- [x] **Step 3: ValuationTrendChart 改造**

`src/renderer/src/components/stock-detail/ValuationTrendChart.tsx`：同样模式（effect 内 chart 实例 → `instanceRef.current`；cleanup 置 null；容器 div 加 `position: 'relative'`；内加 `<ChartExportButton instanceRef={instanceRef} filename="valuation-trend" />`）。先读该文件确认 effect 结构与容器 div 样式（可能高度不同），保持既有尺寸。

- [x] **Step 4: YearlyDividendTrendChart 改造**

`src/renderer/src/components/stock-detail/YearlyDividendTrendChart.tsx`：同样模式，filename 为 `yearly-dividend-trend`。

- [x] **Step 5: BacktestNavChart 改造**

`src/renderer/src/components/backtest/BacktestNavChart.tsx`：同样模式，filename 为 `backtest-nav`。

- [x] **Step 6: 验证编译**

Run: `npm run typecheck`
Expected: 无错误（若 @ant-design/icons 未安装，改用内联 SVG）

- [x] **Step 7: 提交**

```bash
git add src/renderer/src/components/app/ChartExportButton.tsx src/renderer/src/components/stock-detail/PriceTrendChart.tsx src/renderer/src/components/stock-detail/ValuationTrendChart.tsx src/renderer/src/components/stock-detail/YearlyDividendTrendChart.tsx src/renderer/src/components/backtest/BacktestNavChart.tsx
git commit -m "feat(export): 详情页与回测图表支持 PNG 导出"
```

---

## Task B3: 分红中心两个图表导出按钮

**Files:**
- Modify: `src/renderer/src/pages/DividendCenterPage.tsx`

**Interfaces:**
- Consumes: `ChartExportButton`（Task B2）
- Produces: `DividendBarChart` 与 `DividendTrendChart` 渲染导出按钮（两者已有 `instanceRef`）

- [x] **Step 1: 加导出按钮**

`src/renderer/src/pages/DividendCenterPage.tsx`：

- import 增加 `ChartExportButton`
- `DividendBarChart` 与 `DividendTrendChart` 的图表容器 div（`ref={chartRef}` 所在处）加 `position: 'relative'`，内部渲染：

```tsx
        <ChartExportButton instanceRef={instanceRef} filename="dividend-yearly-summary" />
```

与

```tsx
        <ChartExportButton instanceRef={instanceRef} filename="dividend-monthly-trend" />
```

（两组件已有 `instanceRef = useRef<echarts.ECharts | null>(null)`，无需新增；先读文件确认容器 div 结构与 effect 是否始终复用实例。）

- [x] **Step 2: 验证编译 + 提交**

Run: `npm run typecheck` → 无错误

```bash
git add src/renderer/src/pages/DividendCenterPage.tsx
git commit -m "feat(export): 分红中心图表支持 PNG 导出"
```

---

## Task B4: 详情页股息率表 CSV 导出

**Files:**
- Modify: `src/renderer/src/pages/StockDetailPage.tsx`

**Interfaces:**
- Consumes: `exportRowsAsCsv`（Task B1）
- Produces: "现金分配历史" AppCard 标题区导出按钮（filename `dividend-history`）

- [x] **Step 1: 实现导出函数与按钮**

`src/renderer/src/pages/StockDetailPage.tsx`：

- import 增加 `exportRowsAsCsv`（与 `Button`——页面可能已 import，按需）
- 组件内新增：

```tsx
  function exportDividendHistoryCsv() {
    const rows = sortedDividendEvents.map((record) => {
      const yieldRate =
        record.referenceClosePrice > 0 ? record.dividendPerShare / record.referenceClosePrice : undefined
      return {
        自然年: record.year,
        除息日: record.exDate ?? '',
        派息日: record.payDate ?? '',
        每股分红: record.dividendPerShare.toFixed(2),
        类型: '常规',
        单次股息率: yieldRate == null ? '' : `${(yieldRate * 100).toFixed(2)}%`
      }
    })
    exportRowsAsCsv(rows, 'dividend-history')
  }
```

- "现金分配历史" AppCard（标题 L454）的 title 改为：

```tsx
      <AppCard
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>现金分配历史（最近在上）</span>
            <button type="button" className="ledger-filter-chip" onClick={exportDividendHistoryCsv}>
              导出 CSV
            </button>
          </div>
        }
      >
```

（若 AppCard title 渲染空间受限，将按钮移到表格上方说明行区域亦可，保证可见可点。）

- [x] **Step 2: 验证编译 + 提交**

Run: `npm run typecheck` → 无错误

```bash
git add src/renderer/src/pages/StockDetailPage.tsx
git commit -m "feat(export): 详情页现金分配历史支持 CSV 导出"
```

---

# Phase C：数据更新时间提示

## Task C1: fetchedAt 贯通（shared DTO + useCase）

**Files:**
- Modify: `shared/contracts/api.ts`（`AssetDetailDto` 增加 `fetchedAt?: string`）
- Modify: `src/main/application/useCases/getAssetDetail.ts`
- Test: `tests/main/assetUseCases.test.ts`（追加用例）

**Interfaces:**
- Consumes: `AssetSnapshotRepository.findByKey`（返回含 `fetchedAt` 的行）
- Produces: `AssetDetailDto.fetchedAt?: string`（ISO）

- [x] **Step 1: 写失败测试**

在 `tests/main/assetUseCases.test.ts` 追加（沿用该文件既有 `vi.hoisted` + mock AssetRepository 模式，另 mock AssetSnapshotRepository）：

```ts
vi.mock('@main/repositories/assetSnapshotRepository', () => ({
  AssetSnapshotRepository: class {
    findByKey = vi.fn(() => ({
      assetKey: 'FUND:A_SHARE:160222',
      assetType: 'FUND',
      dataJson: '{}',
      fetchedAt: '2026-08-02T10:00:00.000Z'
    }))
  }
}))
```

追加用例（在既有 describe 内）：

```ts
  it('attaches fetchedAt from snapshot repository', async () => {
    repositoryMock.getDetail.mockResolvedValueOnce({
      kind: 'STOCK',
      identifier: { assetType: 'STOCK', market: 'A_SHARE', code: '600519' },
      name: '贵州茅台',
      latestPrice: 1350.6,
      priceHistory: [],
      dividendEvents: [],
      dataSource: 'eastmoney'
    })

    const detail = await getAssetDetail({ assetKey: 'STOCK:A_SHARE:600519' })

    expect(detail.fetchedAt).toBe('2026-08-02T10:00:00.000Z')
  })
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/assetUseCases.test.ts`
Expected: FAIL — `fetchedAt` undefined（detail 无该字段）

- [x] **Step 3: 实现贯通**

`shared/contracts/api.ts` 的 `AssetDetailDto` 增加：

```ts
  fetchedAt?: string
```

`src/main/application/useCases/getAssetDetail.ts` 改造：

```ts
import type { AssetDetailDto, AssetQueryDto } from '@shared/contracts/api'
import { toAssetDetailDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'
import { AssetSnapshotRepository } from '@main/repositories/assetSnapshotRepository'
import { IndexValuationRepository } from '@main/repositories/indexValuationRepository'
import type { FundAssetDetailSource } from '@main/repositories/assetProviderRegistry'

function isFundSource(source: { kind: string }): source is FundAssetDetailSource {
  return source.kind === 'ETF' || source.kind === 'FUND'
}

export async function getAssetDetail(query: AssetQueryDto): Promise<AssetDetailDto> {
  const repository = new AssetRepository()
  const snapshotRepository = new AssetSnapshotRepository()
  const source = await repository.getDetail(query)

  let indexValuation: Awaited<ReturnType<IndexValuationRepository['getIndexValuation']>> | undefined
  if (isFundSource(source) && source.trackingIndex) {
    const indexRepo = new IndexValuationRepository()
    indexValuation = await indexRepo.getIndexValuation(source.trackingIndex)
  }

  const detail = toAssetDetailDto(source, indexValuation)
  const snapshot = snapshotRepository.findByKey(detail.assetKey)

  return {
    ...detail,
    fetchedAt: snapshot?.fetchedAt ?? new Date().toISOString()
  }
}
```

注意：缓存命中路径 snapshot 为该资产的旧快照写入时间；新抓取路径 `AssetRepository.getDetail` 已 upsert，`findByKey` 返回刚刚写入的时间。

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/assetUseCases.test.ts`
Expected: PASS（新增用例 + 既有用例）

- [x] **Step 5: 全量回归 + 提交**

Run: `npx vitest run` → 全量通过

```bash
git add shared/contracts/api.ts src/main/application/useCases/getAssetDetail.ts tests/main/assetUseCases.test.ts
git commit -m "feat(asset): AssetDetailDto 贯通 fetchedAt（数据更新时间）"
```

---

## Task C2: 详情页时间提示 UI

**Files:**
- Create: `src/renderer/src/utils/format.ts`
- Modify: `src/renderer/src/pages/StockDetailPage.tsx`

**Interfaces:**
- Consumes: `AssetDetailDto.fetchedAt`（Task C1）
- Produces: `export function formatDateTime(iso: string): string`（`YYYY-MM-DD HH:mm`）；详情页价格区显示"数据更新于 {time}"

- [x] **Step 1: 创建 format.ts**

创建 `src/renderer/src/utils/format.ts`：

```ts
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

- [x] **Step 2: 详情页显示**

`src/renderer/src/pages/StockDetailPage.tsx` 头部价格区（L183-186 `ledger-detail-price` 块内，`最新价 / ${data.assetType}` span 之后）追加：

```tsx
                    {data.fetchedAt ? (
                      <span style={{ display: 'block', fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                        数据更新于 {formatDateTime(data.fetchedAt)}
                      </span>
                    ) : null}
```

- import 增加 `formatDateTime`

- [x] **Step 3: 验证编译 + 提交**

Run: `npm run typecheck` → 无错误

```bash
git add src/renderer/src/utils/format.ts src/renderer/src/pages/StockDetailPage.tsx
git commit -m "feat(ui): 详情页显示数据更新时间"
```

---

## Task C3: 工作台与自选页刷新时间

**Files:**
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Modify: `src/renderer/src/components/dashboard/DashboardHero.tsx`
- Modify: `src/renderer/src/pages/WatchlistPage.tsx`

**Interfaces:**
- Consumes: `formatDateTime` 辅助（本任务用 `formatTime`：`HH:mm:ss`，在 format.ts 追加）
- Produces: 两页显示"最近刷新 HH:mm:ss"

- [x] **Step 1: format.ts 追加 formatTime**

`src/renderer/src/utils/format.ts` 追加：

```ts
export function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
```

- [x] **Step 2: DashboardHero 增加 prop**

`src/renderer/src/components/dashboard/DashboardHero.tsx`：
- props 类型（L11 附近 `onRefresh: () => void` 旁）增加 `refreshedAt?: Date | null`
- 解构（L23 附近）增加 `refreshedAt`
- 刷新按钮（L83 `{refreshing ? '刷新中...' : '刷新估值'}` 附近）后追加：

```tsx
          {refreshedAt ? (
            <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 8 }}>
              最近刷新 {formatTime(refreshedAt)}
            </span>
          ) : null}
```

（按钮区为 flex 容器，追加 span 即可；import formatTime。）

- [x] **Step 3: DashboardPage 记录刷新时间**

`src/renderer/src/pages/DashboardPage.tsx`：
- 增加 state：`const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)`
- `onRefresh`（L447-454）成功后设置：

```tsx
  async function onRefresh() {
    const result = await refreshQuotes()
    setRefreshedAt(new Date())
    if (result && result.failed > 0) {
      apiMessage.warning(`有 ${result.failed} 个标的刷新失败，请稍后重试`)
    } else {
      apiMessage.success('估值已更新')
    }
  }
```

- 初始加载完成设置一次（首次 `refreshing` 由 true 变 false 且 `rows.length > 0`）：

```tsx
  const initialRefreshDoneRef = useRef(false)
  useEffect(() => {
    if (!refreshing && !initialRefreshDoneRef.current && rows.length > 0) {
      initialRefreshDoneRef.current = true
      setRefreshedAt(new Date())
    }
  }, [refreshing, rows.length])
```

（若 DashboardPage 已有 useRef/useEffect import 则复用；需新增时补齐 import。）

- `<DashboardHero ... />` 传 `refreshedAt={refreshedAt}`

- [x] **Step 4: WatchlistPage 记录刷新时间**

`src/renderer/src/pages/WatchlistPage.tsx`：
- 增加 `const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)`
- `refreshWatchlist`（L156-166，`await reload()` 成功后）加 `setRefreshedAt(new Date())`；初次加载完成（`loading` 首次 false 且 `data.length > 0`）也设置（仿 DashboardPage 的 ref 模式）
- "刷新自选"按钮（L437-438）旁追加：

```tsx
                  {refreshedAt ? (
                    <span style={{ fontSize: 12, color: '#8b949e' }}>
                      最近刷新 {formatTime(refreshedAt)}
                    </span>
                  ) : null}
```

- import `formatTime`（WatchlistPage 若无 utils 依赖则新增）

- [x] **Step 5: 验证编译 + 回归 + 提交**

Run: `npm run typecheck` → 无错误
Run: `npx vitest run` → 全量通过

```bash
git add src/renderer/src/utils/format.ts src/renderer/src/pages/DashboardPage.tsx src/renderer/src/components/dashboard/DashboardHero.tsx src/renderer/src/pages/WatchlistPage.tsx
git commit -m "feat(ui): 工作台与自选页显示最近刷新时间"
```

---

# Phase D：最终验收

## Task D1: 全量回归 + MCP 端到端验收

**Files:**
- 无代码改动（验收任务）

- [x] **Step 1: 静态与单测**

Run: `npm run typecheck` → Expected: 无错误
Run: `npm test` → Expected: 全部 PASS

- [x] **Step 2: 启动 headless 运行时**

```powershell
$p = Start-Process -FilePath "cmd.exe" -ArgumentList '/c','cd /d I:\code\DividendMonitor && set DIVIDEND_MONITOR_HEADLESS=1&& npx electron-vite dev > C:\Users\15845\AppData\Local\Temp\opencode\e2e-data-features.log 2>&1' -WindowStyle Hidden -PassThru
```

等待 `http://127.0.0.1:3210/api/security/nonce` 就绪；vite 端口从日志 `Local:` 行读取（通常 8192）。

- [x] **Step 3: 时间提示验证（浏览器 chrome-devtools）**

1. 打开 `http://127.0.0.1:<port>/#/stock-detail?assetKey=STOCK%3AA_SHARE%3A601857&symbol=601857`
2. 通过标准：头部价格区显示"数据更新于 2026-08-02 HH:mm"且时间合理（与数据库 fetched_at 一致或接近）
3. 打开工作台 `/` → 刷新估值按钮旁显示"最近刷新 HH:mm:ss"
4. 打开自选 `/watchlist` → 刷新自选按钮旁显示"最近刷新 HH:mm:ss"

- [x] **Step 4: 图表导出验证（浏览器点击下载）**

1. 详情页：价格走势 / 估值趋势 / 年度股息柱状图 各点导出按钮 → chrome-devtools 记录下载（PNG），文件 >10KB
2. 回测页 `/backtest/601857`：收益走势图导出 → PNG
3. 分红中心 `/dividend-center`：年度汇总 / 月度趋势导出 → PNG
4. 详情页"现金分配历史"点"导出 CSV" → 文件开头含 BOM（可下载后用文件大小与内容抽样验证），Excel 打开无乱码

- [x] **Step 5: 备份恢复验证（UI + 手动步骤）**

1. 设置页渲染确认："数据备份"卡片存在、两个按钮可见（chrome-devtools snapshot）
2. 备份对话框为系统级（dialog.showSaveDialog），MCP 无法自动化 → **手动验证清单**（输出给用户执行）：
   - 桌面模式（`npm run dev`）打开设置页 → 点"导出备份" → 选择保存位置 → 生成 .sqlite 且大小 >0，message 显示路径
   - 修改数据（如删一条自选）→ 点"恢复备份" → 确认对话框 → 选择刚才的备份 → 页面刷新 → 数据回到备份时状态；数据库目录出现 `pre-restore-<ts>.sqlite` 安全备份

- [x] **Step 6: 清理**

`Get-Process -Name electron | Stop-Process -Force`（如未清理）

---

# Self-Review 记录（计划编写时完成）

**Spec 覆盖核对：**
- §2.1 能力边界（桌面 IPC / fallback 抛错 / 安全备份 / closeDatabase）→ A1、A3、A4 ✓
- §2.2 主进程改动（closeDatabase、backupChannels、合约、preload、fallback）→ A1-A4 ✓
- §2.3 UI 入口（设置页备份区块 + Modal.confirm）→ A5 ✓
- §3.1 chartExport 工具 → B1 ✓
- §3.2 ChartExportButton + 6 图 → B2、B3 ✓
- §3.4 详情页 CSV → B4 ✓
- §4.1 fetchedAt 贯通 + 详情页 UI → C1、C2 ✓
- §4.2 工作台/自选刷新时间 → C3 ✓
- §5 测试策略 → 各任务 TDD 步骤 ✓
- §6 端到端 MCP → D1 ✓
- §7 非目标 → 未触碰（其他图表组件、全局页脚、云备份、加密）✓

**类型一致性核对：**
- `closeDatabase`/`getDatabaseFilePath`：A1 定义，A3 消费（backupChannels）✓
- `copySqliteFile`/`buildBackupFileName`/`buildPreRestoreFileName`：A2 定义，A3 消费 ✓
- `backup.createBackup/restoreBackup` 返回类型：A3 合约定义，A4 消费（类型完整性）✓
- `buildCsv`/`exportRowsAsCsv`/`exportChartAsPng`：B1 定义，B2（ChartExportButton）/B4（CSV）消费 ✓
- `ChartExportButton` props（instanceRef/filename）：B2 定义，B2/B3 消费 ✓
- `AssetDetailDto.fetchedAt`：C1 定义，C2 消费 ✓
- `formatDateTime`/`formatTime`：C2/C3 定义与消费 ✓

**已知风险与执行说明（不影响任务顺序）：**
- A3 Step 4 preload 的 `unwrapIpc` 包装：以 `src/preload/index.ts` 实际代码为准（读文件后按 settings 命名空间同款写法）
- B2 的 `@ant-design/icons` 依赖：package.json 无此依赖时改用内联 SVG（计划已含两种方案）
- B3 分红中心内联组件已有 instanceRef：实现时确认 effect 复用实例逻辑，仅加按钮
- D1 Step 5 备份对话框无法 MCP 自动化（系统级对话框）→ 输出手动验证清单
