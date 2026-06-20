# 持仓分组与操作栏图标化设计

- **状态**: Draft
- **日期**: 2026-06-20
- **作者**: Alex + opencode
- **关联文档**: `docs/SDD.md` §11.1、`docs/MULTI-ASSET-ARCHITECTURE.md`、`docs/ARCHITECTURE.md`

## 1. 背景与目标

### 1.1 诉求

Alex 希望给持仓资产加分组功能，像自选池一样管理；同时把持仓表操作栏从文字按钮改成图标；并去掉 FUND/GOLD/STOCK 文字标签（靠 AssetAvatar 区分）。同时保留未来按风险等级（波动率自动分低/中/高）分类的扩展空间。

### 1.2 关键决策

| 维度 | 决策 |
|------|------|
| 分组关系 | **分组定义共用**（组名列表自选池与持仓共用）；**资产-分组关联独立于自选池/持仓**，加入分组不强制加入自选池 |
| 分组筛选 | 持仓表顶部 Tab 切换（全部 \| 分组A \| 分组B \| + 新建） |
| 资产类别标签 | 去掉 Tag，靠 AssetAvatar 颜色区分 |
| 操作栏图标 | 分组(groups) + 详情(detail) + 编辑(edit 新增) + 删除(delete) |
| 风险等级 | 首期只预留 schema 字段，UI 不展示不编辑不计算 |

### 1.3 非目标

- 风险等级自动计算与 UI（后续迭代）
- 资产类别（FUND/GOLD/STOCK）作为可筛选维度（去掉标签即可，不做替代筛选器）
- 分组关联强制绑定自选池（已修正：分组独立，见 §2.1）

## 2. 数据模型

### 2.1 分组关联（解耦自选池外键）

现有 `watchlist_group_assets` 外键 `REFERENCES watchlist_items(asset_key) ON DELETE CASCADE` 强制分组关联依赖自选池记录——持仓资产加入分组会因外键失败，或被迫先加入自选池。这违背"分组独立"语义。

**迁移**：重建 `watchlist_group_assets`，去掉对 `watchlist_items` 的外键：

```sql
-- 迁移脚本（幂等）
CREATE TABLE IF NOT EXISTS watchlist_group_assets_v2 (
  group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, asset_key)
);

INSERT OR IGNORE INTO watchlist_group_assets_v2 (group_id, asset_key, added_at)
SELECT group_id, asset_key, added_at FROM watchlist_group_assets;

DROP TABLE watchlist_group_assets;
ALTER TABLE watchlist_group_assets_v2 RENAME TO watchlist_group_assets;

CREATE INDEX IF NOT EXISTS idx_watchlist_group_assets_group
  ON watchlist_group_assets(group_id, added_at DESC);
```

迁移后：
- 资产加入分组不再要求该资产在 `watchlist_items` 中
- 自选池删除资产时，分组关联**不再**自动断开（CASCADE 已移除）。这是有意为之——分组是独立组织层，资产离开自选池不等于离开分组
- 分组删除时，关联仍自动断开（`group_id` 外键保留 CASCADE）

### 2.2 风险等级预留列

`portfolio_positions` 新增一列：

| 列 | 类型 | 默认值 | 含义 |
|----|------|--------|------|
| `risk_level` | TEXT | NULL | `LOW` / `MEDIUM` / `HIGH` / NULL |

迁移脚本（沿用 `src/main/infrastructure/db/sqlite` 现有迁移模式）：

```sql
ALTER TABLE portfolio_positions ADD COLUMN risk_level TEXT;
```

幂等：已有行自动获得 NULL，不影响现有读写。

### 2.3 Supabase 端

`portfolio_positions` 表手动执行 `ALTER TABLE portfolio_positions ADD COLUMN risk_level TEXT;`。RLS 策略已有，无需改动。

### 2.4 DTO 扩展

`shared/contracts/api.ts`：

- `PortfolioPositionDto`：新增 `riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'`
- `PortfolioPositionUpsertDto`：新增 `riskLevel?`，缺省时不写入该字段

## 3. 后端改动

### 3.1 零新用例、零新 IPC 通道

分组 CRUD 全部复用现有 `watchlist:*` 通道：

| 操作 | 现有 IPC 通道 |
|------|---------------|
| 列分组 | `watchlist:list-groups` |
| 新建分组 | `watchlist:create-group` |
| 重命名 | `watchlist:update-group` |
| 删除分组 | `watchlist:delete-group` |
| 加入分组 | `watchlist:add-to-group` |
| 移出分组 | `watchlist:remove-from-group` |
| 查资产所属分组 | `watchlist:get-asset-group-ids` |
| 列分组内资产 | `watchlist:list-group-assets` |

### 3.2 risk_level 字段读写

- `PortfolioRepository.upsert`：INSERT 时补 `risk_level` 列；`list` SELECT 补该列
- `SupabasePortfolioRepository.upsert` / `list`：同步读写 `risk_level`
- 纯透传，不做业务校验（首期 UI 不传该字段，始终为 NULL）

## 4. 前端数据层

### 4.1 复用 useWatchlistGroups

新增 `usePortfolioGroups` hook 或直接在 `DashboardPage` 调用现有 `useWatchlistGroups`（它已封装 `listGroups` / `createGroup` / `updateGroup` / `deleteGroup` / `addToGroup` / `removeFromGroup`）。持仓页和自选池页共用同一份分组状态，天然双向同步。

### 4.2 持仓-分组关联加载

在 `DashboardPage` 或 `usePortfolio` 中：

1. 持仓列表加载后，对每个 `assetKey` 调 `watchlistApi.getAssetGroupIds(assetKey)`
2. 批量并发（复用现有接口，无新 API）
3. 维护 `assetKeyToGroupIds: Map<assetKey, groupId[]>`
4. Tab 切换到某分组时：`rows.filter(row => assetKeyToGroupIds.get(row.assetKey)?.includes(activeGroupId))`
5. "全部" Tab 显示所有持仓

### 4.3 分组状态刷新时机

- 持仓列表变化（新增/删除持仓）→ 重新加载 `assetKeyToGroupIds`
- 分组关系变化（行操作栏加入/移出分组）→ 更新对应 `assetKey` 的分组 id 数组
- 分组本身变化（新建/删除/重命名）→ 刷新分组列表

## 5. 前端 UI

### 5.1 分组 Tab 行

持仓表（`PortfolioTable`）上方加一排 Tab：

```
[全部] [分组A] [分组B] [+ 新建分组]
```

- 点击分组名切换过滤
- `+ 新建分组` 点击后弹内联输入框，回车创建
- 分组名 hover 出小图标可重命名/删除（复用 `WatchlistPage` 现有交互模式）
- 当前选中 Tab 高亮
- 样式参照自选池页的分组 Tab

### 5.2 持仓表操作栏图标化

移除 `PortfolioTable.tsx` 现有文字按钮"详情"/"编辑"/"删除"，改为 4 个图标按钮，样式与 `WatchlistTable` 一致（`ledger-inline-action-btn ledger-icon-only`）：

| 图标 | LedgerIcon name | 行为 |
|------|-----------------|------|
| 分组管理 | `groups` | 弹 Popover，复选框列表勾选/取消所属分组 |
| 详情 | `detail` | 跳详情页（现有 `onGoToDetail`） |
| 编辑 | `edit`（新增图标） | 打开现有 `PortfolioPositionEditorModal`（现有 `onEdit`） |
| 删除 | `delete`（`is-danger` 样式） | 现有删除流程（现有 `onRemove`） |

每个图标按钮带 `title` 属性提供 hover 提示。

### 5.3 移除资产类别 Tag

`PortfolioTable.tsx` 删除：

```tsx
{record.assetType ? <Tag color="blue">{record.assetType}</Tag> : null}
```

靠 `AssetAvatar` 已有的 STOCK/ETF/FUND/GOLD/SILVER 不同配色区分资产类别。

### 5.4 LedgerIcon 新增 edit 图标

`src/renderer/src/components/app/LedgerUi.tsx`：

- `LedgerIconName` 类型加 `'edit'`
- 新增铅笔 svg path，风格与现有图标一致（`strokeWidth="1.8"`、`strokeLinecap="round"`）

## 6. 组件抽离

### 6.1 AssetGroupPopover

当前 `AssetGroupPopover` 在 `WatchlistTable.tsx` 内部定义。持仓表也要用，抽到独立文件：

**新位置**：`src/renderer/src/components/app/AssetGroupPopover.tsx`

**Props 不变**：

```ts
type AssetGroupPopoverProps = {
  assetKey: string
  groups: WatchlistGroupDto[]
  getAssetGroupIds: (assetKey: string) => Promise<string[]>
  onToggle: (groupId: string, add: boolean) => Promise<void>
}
```

`WatchlistTable` 改为从 `components/app/AssetGroupPopover` import，持仓表同样 import。

## 7. 错误与边界

| 场景 | 处理 |
|------|------|
| 资产不在任何分组 | 只在"全部" Tab 显示，分组 Tab 里不显示 |
| 分组被删除 | 该分组 Tab 消失，当前在该 Tab 则回退到"全部" |
| `getAssetGroupIds` 失败 | 该行按"未分组"处理，不阻塞其他行 |
| 资产在自选池被移除 | 分组关联**保留**（外键 CASCADE 已移除）。资产离开自选池仍在分组里，持仓表该行仍属该分组 |
| 新建持仓时 | 不强制选分组，录入后可通过行操作栏的分组图标补加 |
| 持仓的资产不在自选池 | 可直接加入分组，无需先加入自选池（外键约束已放宽） |

## 8. 测试策略

### 8.1 后端

- `PortfolioRepository` / `SupabasePortfolioRepository` 补 `risk_level` 字段读写测试（upsert 带 riskLevel → list 能读回）
- 回归：现有 197 个测试全通过

### 8.2 前端

- `AssetGroupPopover` 抽离后，`WatchlistTable` 现有行为不变（回归）
- 持仓表 Tab 过滤逻辑单测：mock `assetKeyToGroupIds`，验证不同 Tab 下过滤结果
- 操作栏图标渲染单测：4 个图标按钮存在且 title 正确

### 8.3 集成验证

手动验证：
1. 持仓表把资产加入分组A → 该资产出现在持仓表分组A Tab（无需在自选池）
2. 自选池把资产移出 → 该资产仍保留在分组A（关联独立）
3. 持仓表新建分组B → 自选池页也能看到分组B（分组定义共用）
4. 持仓表删除分组B → 自选池页分组B 也消失
5. **回归**：自选池删除资产后，该资产在分组里仍保留（行为变化，需确认自选池页分组 Tab 仍能正确展示）

## 9. 架构契合度

- **后端零新表零新通道**，符合"复用现有"原则
- **`AssetGroupPopover` 抽到 `components/app/`**，遵循"共享 UI 组件放 app 目录"约定
- **`LedgerIcon` 扩展**沿用现有图标组件模式，不引入图标库
- **风险等级字段预留**不污染现有业务逻辑，纯 schema 占位
- **依赖方向不变**：前端 hook → renderer service → IPC → useCase → repository，无反向依赖

## 10. 已解决的设计问题

### 10.1 分组与自选池解耦

原设计让分组关联外键依赖 `watchlist_items`，导致持仓资产加入分组被强制加入自选池——逻辑不对称。已修正：迁移去掉外键，分组成为独立于自选池/持仓的第三层资产组织。资产可在分组里无论是否在自选池/持仓。

### 10.2 后续扩展

- **风险等级 UI**：后续加 `usePortfolioRiskLevels` hook + 自动计算（调 `portfolioRiskService` 的波动率）+ 持仓表新增"风险"列或第三层 Tab
- **资产类别筛选**：若后续需要按 FUND/GOLD/STOCK 筛选，可加第二层 Tab 或下拉，不影响当前分组 Tab
