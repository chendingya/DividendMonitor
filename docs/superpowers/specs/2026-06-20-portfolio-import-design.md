# 持仓导入功能设计

- **状态**: Draft
- **日期**: 2026-06-20
- **作者**: Alex + opencode
- **关联文档**: `docs/SDD.md` §11.1（首页"一键导入/导出持仓"规划）、`docs/ARCHITECTURE.md`、`docs/MULTI-ASSET-ARCHITECTURE.md`

## 1. 背景与目标

### 1.1 用户诉求

Alex 希望能从支付宝理财通 / 腾讯理财通直接导入资产持仓信息，免去逐笔手动录入。

### 1.2 可行性结论

支付宝与理财通**均未**向个人开发者开放"代用户查询理财持仓"的官方 API（账户隐私受严格保护）。因此本功能采用**用户先在 App 内导出文件 → 应用解析文件 → 预览确认 → 写入本地 SQLite** 的路径。不做逆向私有接口、不做截图 OCR。

### 1.3 首期范围

| 维度 | 决策 |
|------|------|
| 支持来源 | 支付宝理财持仓 CSV、腾讯理财通持仓 CSV |
| OCR | 不做，只支持文件 |
| 数据粒度 | 只导入当前净持仓（份额 + 平均成本），不导入历史交易流水 |
| 未匹配资产 | 预览 + 手动修正 |
| 冲突处理 | 预览表逐行选 + 系统自动推荐策略 |
| 导出 | 首期不做 |
| 导入历史/撤销 | 不做，导入即最终 |

### 1.4 非目标

- 实时连接支付宝/理财通账户
- 截图 OCR 识别
- 历史交易流水导入（需新增交易表，后续迭代）
- 导出持仓为 CSV/JSON
- 导入批次管理与撤销

## 2. 数据模型变更

### 2.1 schema 扩展

`portfolio_positions` 表新增两列：

| 列 | 类型 | 默认值 | 含义 |
|----|------|--------|------|
| `source` | TEXT NOT NULL | `'MANUAL'` | `MANUAL` / `ALIPAY` / `LICAITONG` |
| `snapshot_date` | TEXT | NULL | ISO 日期（`YYYY-MM-DD`），导入文件的快照日；手动录入与老数据为 NULL |

### 2.2 DTO 同步扩展

`shared/contracts/api.ts` 中：

- `PortfolioPositionDto`：新增 `source: 'MANUAL' | 'ALIPAY' | 'LICAITONG'`、`snapshotDate?: string`
- `PortfolioPositionUpsertDto`：新增 `source?`、`snapshotDate?`，缺省时 repository 层补 `'MANUAL'`
- `PortfolioPositionReplaceByAssetDto`：新增 `source?`、`snapshotDate?`

### 2.3 迁移

沿用 `src/main/infrastructure/db` 现有迁移模式，新增迁移脚本：

```sql
ALTER TABLE portfolio_positions ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE portfolio_positions ADD COLUMN snapshot_date TEXT;
-- 已有行自动获得 source='MANUAL'，snapshot_date 保持 NULL，幂等
```

### 2.4 唯一性约束

**不加** `(source, asset_key)` 唯一约束。不同来源允许同 `assetKey` 共存多条（例如用户在支付宝和理财通同时持有同一基金）。冲突判断在用例层完成，不在 DB 层。

## 3. 解析器层

### 3.1 目录与接口

新增 `src/main/application/importers/`：

```
src/main/application/importers/
├── types.ts              # ParsedPositionRow, ImportSourceParser 接口
├── alipayImporter.ts     # 支付宝理财持仓 CSV 解析
├── licaitongImporter.ts  # 理财通持仓 CSV 解析
└── index.ts              # parser 注册表 + detect 分发
```

统一接口：

```ts
export type ParsedPositionRow = {
  rawName: string          // 文件原始名称，如"易方达蓝筹精选混合"
  code?: string            // 文件若带代码（理财通常有，支付宝通常无）
  shares: number
  avgCost: number          // 单位净值/成本
  snapshotDate?: string    // ISO 日期，解析不出留空
  rawLine: number          // 原始行号，出错定位
  warnings?: string[]      // 解析期非致命警告
}

export interface ImportSourceParser {
  readonly source: 'ALIPAY' | 'LICAITONG'
  detect(content: string): boolean        // 通过表头判断是否本格式
  parse(content: string): ParsedPositionRow[]
}
```

### 3.2 职责边界

解析器**只做格式转换**：
- 输入：文件文本内容（已转 UTF-8）
- 输出：`ParsedPositionRow[]`
- 不调 AssetProvider、不读本地库、不做冲突判断

资产匹配与冲突判定在用例层，因为它们要调 `AssetProviderRegistry` 和读本地持仓。

### 3.3 解析器选择

用例 `parseImportFile` 遍历所有 parser，用 `detect()` 选第一个匹配的；都不匹配抛 `UnknownImportFormatError`。新增第三个来源只加一个 parser 文件，入口用例不变。

### 3.4 编码处理

支付宝 CSV 通常是 GBK 编码。文件读取层统一转 UTF-8：
- 桌面模式：优先用 Electron / Node 内置能力（`TextDecoder` 支持 GBK）
- 浏览器预览模式：浏览器 `TextDecoder('gbk')` 同样支持
- 实现时确认是否需要 `iconv-lite`，倾向零依赖

### 3.5 CSV 解析依赖

新增 `papaparse`（~50KB，成熟稳定，处理中文/引号/杂乱 CSV 鲁棒）。不加 `xlsx`——首期不支持 Excel。

### 3.6 错误容忍

逐行 warning，整单不中断：
- 能解析的行进预览表，`warnings` 字段记录非致命问题（如"成本价字段为空，已按 0 处理"）
- 完全无法解析的行（字段缺失/格式错乱）以 `parseError` 进预览表，标红，用户可跳过
- 仅当文件完全无法被任何 parser 识别时才整单失败

## 4. 资产匹配与冲突判定

### 4.1 用例

`src/main/application/useCases/parseImportFile.ts`：

```ts
async function parseImportFile(
  fileName: string,
  rawContent: string
): Promise<ImportPreviewRow[]>
```

职责：
1. 选择 parser 并解析 → `ParsedPositionRow[]`
2. 对每行做资产匹配 → `AssetIdentifierDto | undefined`
3. 读本地持仓，对每行算 `suggestedStrategy`
4. 返回 `ImportPreviewRow[]`（不写库）

### 4.2 资产匹配规则

```
for each ParsedPositionRow:
  if code 可识别资产类型:
    构造 AssetIdentifierDto，matchStatus = 'MATCHED'
  else if rawName 能在 AssetProviderRegistry 搜到唯一结果:
    取第一个结果，matchStatus = 'MATCHED'
  else if 搜到多个结果:
    matchStatus = 'AMBIGUOUS'，候选列表带回前端供用户选
  else:
    matchStatus = 'UNMATCHED'
```

资产类型识别规则（复用现有 `AssetProviderRegistry.supports`）：
- 6 位代码且 6/0/3 开头 → STOCK:A_SHARE
- 5 位代码且 5 开头 / 6 位 1 开头 → ETF:A_SHARE
- 6 位基金代码 → FUND:A_SHARE

搜索调用 `AssetProviderRegistry.getSearchProviders(['FUND','ETF']).search(rawName)`，取 Top N（N=5）作为 AMBIGUOUS 候选。

### 4.3 冲突判定策略

```
load existing positions (含 source/snapshot_date)
for each preview row:
  sameKeyRows = existing.filter(r => r.assetKey === row.assetKey)
  if sameKeyRows.length === 0:
    conflictStatus = 'ADD'
  else:
    sameSource = sameKeyRows.filter(r => r.source === importSource)
    if sameSource.length > 0:
      // 同源已有记录 → 默认覆盖该条
      conflictStatus = 'REPLACE_SAME_SOURCE'
      conflictTargetId = sameSource[0].id
      // 旧的覆盖新的没意义
      if row.snapshotDate && sameSource[0].snapshotDate
         && row.snapshotDate < sameSource[0].snapshotDate:
        conflictStatus = 'SKIP'
    else:
      // 异源（含手动）已有记录 → 默认新增为另一条，标黄提示
      conflictStatus = 'ADD_WITH_HINT'
      hint = '本地已有手动/异源持仓，确认是否新增'
```

### 4.4 预览行结构

```ts
type ImportPreviewRow = ParsedPositionRow & {
  matched?: AssetIdentifierDto & { name: string }
  matchStatus: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED'
  matchCandidates?: AssetSearchSource[]    // AMBIGUOUS 时的候选
  conflictStatus: 'ADD' | 'REPLACE_SAME_SOURCE' | 'ADD_WITH_HINT' | 'SKIP'
  conflictTargetId?: string
  hint?: string
  userStrategy?: 'ADD' | 'REPLACE' | 'SKIP'  // 用户在预览表改的，覆盖 suggested
  userSelectedAsset?: AssetIdentifierDto & { name: string }  // UNMATCHED/AMBIGUOUS 时用户手选的
}
```

## 5. 提交与持久化

### 5.1 用例

`src/main/application/useCases/commitImportedPositions.ts`：

```ts
type CommitImportRequest = {
  source: 'ALIPAY' | 'LICAITONG'
  rows: Array<{
    asset: AssetIdentifierDto & { name: string }
    shares: number
    avgCost: number
    snapshotDate?: string
    strategy: 'ADD' | 'REPLACE' | 'SKIP'
    targetId?: string        // REPLACE 时要覆盖的本地 id
  }>
}

type CommitImportResult = {
  added: number
  replaced: number
  skipped: number
  fallbackToADD: number      // REPLACE 时 targetId 已失效，降级为 ADD 的行数
}
```

### 5.2 执行逻辑

单事务：

```
BEGIN
for each row where strategy !== 'SKIP':
  validate targetId 仍存在 && assetKey 仍匹配
  if strategy === 'REPLACE' && targetId 有效:
    UPDATE portfolio_positions
      SET shares, avg_cost, source, snapshot_date, updated_at
      WHERE id = targetId          // 不删不插，保留 created_at
  else:
    INSERT new row (id=新生成, source, snapshot_date)
COMMIT
```

**一致性兜底**：用户看预览表期间可能在别处改了持仓，导致 `targetId` 失效。此时该行降级为 ADD，在返回结果里计 `fallbackToADD`。

### 5.3 IPC 通道

新增到 `src/main/ipc/channels/portfolioChannels.ts`：

- `portfolio:parse-import-file` → `(fileName: string, rawContent: string) => ImportPreviewRow[]`
- `portfolio:commit-import` → `(CommitImportRequest) => CommitImportResult`

同步更新 `src/preload/index.ts` 的 bridge 暴露、`shared/contracts/api.ts` 的 `PortfolioApi` 接口、`src/renderer/src/services/desktopApi.ts` 的运行时分发，以及 `src/main/http/routes/` 的本地 HTTP API（browser-preview 模式兼容）。

### 5.4 为何拆成 parse/commit 两次 IPC

parse 是纯计算 + 远端搜索（可能慢），commit 是写操作。分两次让前端在用户看预览表时已把 parse 跑完，点"确认导入"只做快写入。预览表可反复调（用户改完手选资产后可重新算冲突？——首期不重新算，冲突判定结果在 parse 阶段固定）。

## 6. 前端交互

### 6.1 入口

Dashboard 页 `DashboardHero` 组件新增"导入持仓"按钮，点击弹出全屏 Antd Modal。不新增路由。

### 6.2 Modal 流

```
[1] Upload 拖拽区 (Antd Upload.Dragger)
      ├─ 选文件后渲染进程读为字符串
      ├─ 调 desktopApi.portfolio.parseImportFile(fileName, content)
      └─ 成功 → 跳 [2]；失败 → 显示 UnknownImportFormatError 提示
[2] 预览表 (Antd Table)
      ├─ 列: 状态 | 原始名称 | 匹配资产 | 份额 | 成本 | 快照日 | 冲突 | 策略
      ├─ 状态列颜色: 绿(MATCHED) / 黄(AMBIGUOUS) / 红(UNMATCHED 或 parseError)
      ├─ 匹配资产列: UNMATCHED/AMBIGUOUS 时为 Antd Select 远程搜索
      │            (复用 assetApi.search)，MATCHED 时只读显示
      ├─ 冲突列: 显示本地已有持仓摘要 + hint
      ├─ 策略列: Antd Select 下拉
      │         选项 = [新增, 覆盖(id=xxx), 跳过]
      │         默认值 = suggestedStrategy，用户可改
      └─ 底部: 取消 | 确认导入(N 条)
[3] 确认导入
      ├─ 调 desktopApi.portfolio.commitImport(request)
      ├─ 成功 → toast "新增 X 替换 Y 跳过 Z" → 关 Modal → 刷新 Dashboard
      └─ 失败 → toast 错误，留在预览表
```

### 6.3 状态管理

不引入 zustand（项目约定无全局状态库）。Modal 内部用 `useState` 管理：`phase: 'upload' | 'preview'`、`previewRows`、`submitting`。复用现有 `usePortfolio` hook 的刷新能力在导入完成后刷新 Dashboard。

## 7. 错误处理

| 场景 | 处理 |
|------|------|
| 文件无法被任何 parser 识别 | Modal 内提示"无法识别文件格式，请确认是支付宝/理财通导出的 CSV" |
| 文件为空 / 无有效行 | 提示"文件中没有可导入的持仓行" |
| 单行解析失败 | 进预览表标红，`parseError` 列显示原因，用户可跳过 |
| 资产搜索远端不可达 | 该行 `matchStatus = 'UNMATCHED'`，用户可手选或跳过；不影响其他行 |
| commit 时 targetId 失效 | 降级为 ADD，结果中 `fallbackToADD` 计数 |
| commit 事务失败 | ROLLBACK，toast 错误，预览表保留 |
| 文件过大 | 软上限 5MB（够覆盖上千行），超出提示用户裁剪 |

## 8. 测试策略

### 8.1 解析器单测

`src/main/application/importers/__tests__/alipayImporter.test.ts`、`licaitongImporter.test.ts`：
- 使用 Alex 提供的**真实脱敏样本**作为测试夹具（`test/fixtures/import/alipay-sample.csv` 等，金额/姓名打码，保留表头与几行结构）
- 覆盖：正常解析、缺列、空行、GBK 编码、异常金额格式、多行 warnings

### 8.2 用例单测

- `parseImportFile.test.ts`：mock `AssetProviderRegistry` 与 `PortfolioRepository`，验证匹配与冲突判定各分支
- `commitImportedPositions.test.ts`：mock repository，验证 ADD/REPLACE/SKIP/fallbackToADD 各路径与事务回滚

### 8.3 集成验证

手动用真实样本在 `npm run dev` 下走完整流程，确认写入 SQLite 后 `portfolio:list` 能正确返回 `source` 与 `snapshotDate`。

## 9. 架构契合度

- **解析器**位于 `application/importers/`，符合项目"每个文件一个职责"风格
- **用例**位于 `application/useCases/`，复用现有 `AssetProviderRegistry` 与 `PortfolioRepository`
- **IPC 通道**注册到现有 `portfolioChannels.ts`，不新建文件
- **DTO** 扩展在 `shared/contracts/api.ts`，保持跨进程类型一致
- **依赖方向**：`importers → application → repositories → adapters → infrastructure`，不破坏现有单向依赖

## 10. 待办与风险

### 10.1 待真实样本确认

解析器的列映射规则、编码、表头识别都依赖支付宝/理财通**真实导出文件**。Alex 已同意提供脱敏样本，实现阶段以样本为准调整 `detect()` 与 `parse()`。

### 10.2 后续可扩展

- 新增来源（如券商对账单）：只加一个 parser 文件 + 注册
- 导出能力：后续加 `exportPortfolio` 用例 + 对应 IPC
- 导入历史/撤销：若后续需要，新增 `import_batches` 表记录每次导入涉及的 row id
- 历史交易流水导入：需先新增交易流水表与迁移，再扩展 importer 输出粒度
