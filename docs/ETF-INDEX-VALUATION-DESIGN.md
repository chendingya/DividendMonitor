# ETF 跟踪指数估值分位图 — 设计方案

## 1. 背景与目标

### 1.1 现状

当前系统的估值分位分析仅支持股票（PE/PB），ETF 的 `hasValuationAnalysis` 为 `false`。

ETF 详情中已有 `trackingIndex` 字段（如"沪深300"、"中证500"），但未被用于获取对应指数的估值数据。

### 1.2 目标

为 ETF 详情页新增"跟踪指数估值"模块，展示 ETF 所追踪基准指数的 PE/PB 估值分位图，复用现有的估值分位计算逻辑和图表组件。

### 1.3 设计原则

- **单一职责**：每个模块只负责一件事
- **依赖倒置**：高层模块不依赖低层模块，都依赖抽象
- **开闭原则**：对扩展开放，对修改封闭
- **可扩展**：未来可支持独立指数查询、指数对比等场景

---

## 2. 架构设计

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Renderer Layer                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  StockDetailPage                                        │   │
│  │    └── IndexValuationCard (新增)                         │   │
│  │          └── IndexValuationTrendChart (新增)             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  getAssetDetail (扩展)                                   │   │
│  │    └── 当 assetType=ETF 时，获取指数估值                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Repository Layer                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  IndexValuationRepository (新增)                         │   │
│  │    ├── 解析 trackingIndex → 指数代码                     │   │
│  │    ├── 优先：东方财富（有历史趋势）                      │   │
│  │    └── 降级：蛋卷基金（只有快照）                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Domain Layer                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  IndexCodeResolver (新增)                                │   │
│  │    └── 通过搜索接口动态获取指数代码                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  valuationService (复用)                                 │   │
│  │    └── buildValuationWindows                             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  数据源 1: 东方财富 (Primary)                            │   │
│  │    ├── ValuationDataSource (复用)                        │   │
│  │    │   ├── getSnapshot (估值快照)                        │   │
│  │    │   └── getTrend (估值趋势)                           │   │
│  │    └── eastmoneyValuationAdapter (复用)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  数据源 2: 蛋卷基金 (Fallback)                           │   │
│  │    └── DanjuanIndexValuationAdapter (新增)               │   │
│  │        └── /djapi/index_eva/dj                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
ETF详情 (trackingIndex: "中证500")
        │
        ▼
IndexCodeResolver.resolve("中证500")
        │
        ▼
搜索接口: searchapi.eastmoney.com?input=中证500
        │
        ▼
筛选 SecurityType=5 (指数类型)
        │
        ▼
指数代码: "000905"
        │
        ▼
ValuationDataSource.getSnapshot("000905", 1)  // PE快照
ValuationDataSource.getSnapshot("000905", 2)  // PB快照
ValuationDataSource.getTrend("000905", 1)     // PE历史
ValuationDataSource.getTrend("000905", 2)     // PB历史
        │
        ▼
buildValuationWindows(metric)
        │
        ▼
IndexValuationDto
        │
        ▼
IndexValuationCard + IndexValuationTrendChart
```

---

## 3. 详细设计

### 3.1 Domain Layer

#### 3.1.1 IndexCodeResolver (新增)

**文件**: `src/main/domain/services/indexCodeResolver.ts`

**职责**: 通过搜索接口动态获取指数证券代码

**设计变更**: 不再硬编码映射表，改为调用东方财富搜索接口动态查询。

**原因**:
1. 指数名称可能变化（如基金公司调整跟踪指数）
2. 新指数不断出现，硬编码维护成本高
3. 搜索接口已支持指数查询（SecurityType=5）

```typescript
/**
 * 指数代码解析器
 *
 * 设计考量：
 * 1. 通过搜索接口动态获取，避免硬编码映射
 * 2. 结果缓存，避免重复查询
 * 3. 支持模糊匹配（去除"指数"后缀等）
 */

export type IndexCodeResult = {
  code: string
  name: string
  market: 'SH' | 'SZ'
}

type CacheEntry = {
  expiresAt: number
  value: IndexCodeResult | undefined
}

const INDEX_CODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24小时，指数代码变化频率低
const indexCodeCache = new Map<string, CacheEntry>()

/**
 * 标准化指数名称
 * - 去除首尾空格
 * - 去除"指数"后缀（如"沪深300指数" → "沪深300"）
 * - 统一全角/半角
 */
function normalizeIndexName(name: string): string

/**
 * 通过搜索接口解析指数名称为证券代码
 * @returns 指数代码结果，如果无法解析则返回 undefined
 */
export async function resolveIndexCode(indexName: string): Promise<IndexCodeResult | undefined>

/**
 * 清除缓存（用于测试或手动刷新）
 */
export function clearIndexCodeCache(): void
```

**实现要点**:
1. 调用 `SourceGateway.request({ capability: 'asset.search', input: { keyword: indexName, count: 20 } })`
2. 从搜索结果中筛选 `SecurityType === '5'`（指数类型）
3. 匹配最相关的结果（优先完全匹配，其次前缀匹配）
4. 缓存结果，避免重复查询

**扩展点**:
- 未来可支持正则匹配（如"沪深300*"匹配所有沪深300相关指数）
- 未来可支持跨市场指数（港股、美股）

#### 3.1.2 valuationService (复用，无需修改)

现有的 `buildValuationWindows` 函数完全适用于指数估值数据，无需修改。

### 3.2 Infrastructure Layer

#### 3.2.1 DanjuanIndexValuationAdapter (新增)

**文件**: `src/main/adapters/danjuan/danjuanIndexValuationAdapter.ts`

**职责**: 从蛋卷基金获取指数估值快照数据

```typescript
export type DanjuanIndexValuationSource = {
  currentValue: number
  currentPercentile: number
  status: 'low' | 'medium' | 'high'
}

export interface IndexValuationSnapshotAdapter {
  getIndexSnapshot(indexCode: string): Promise<DanjuanIndexValuationSource | undefined>
}

export class DanjuanIndexValuationAdapter implements IndexValuationSnapshotAdapter {
  async getIndexSnapshot(indexCode: string): Promise<DanjuanIndexValuationSource | undefined> {
    // 调用 https://danjuanfunds.com/djapi/index_eva/dj
    // 从返回的列表中匹配 indexCode
    // 返回 PE、PB、分位数
  }
}
```

**蛋卷基金接口**:
- URL: `https://danjuanfunds.com/djapi/index_eva/dj`
- 返回: 63 个指数的估值快照
- 代码格式: `SH000300` (上证) / `SZ399006` (深证) / `CSI930740` (中证)

**代码格式转换**:
```typescript
// 搜索接口返回: "000300" (沪深300)
// 蛋卷基金需要: "SH000300"

function toDanjuanCode(code: string): string {
  if (code.startsWith('6') || code.startsWith('5') || code.startsWith('000')) {
    return `SH${code}`  // 上证
  }
  return `SZ${code}`  // 深证
}
```

### 3.3 Repository Layer

#### 3.3.1 IndexValuationRepository (新增)

**文件**: `src/main/repositories/indexValuationRepository.ts`

**职责**: 获取指数的估值数据（多数据源策略）

```typescript
import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'
import type { ValuationDataSource } from '@main/adapters/contracts'
import type { IndexValuationSnapshotAdapter } from '@main/adapters/danjuan/danjuanIndexValuationAdapter'
import { resolveIndexCode, type IndexCodeResult } from '@main/domain/services/indexCodeResolver'
import { createValuationDataSource } from '@main/adapters'

export type IndexValuationSource = {
  indexCode: string
  indexName: string
  source: 'eastmoney' | 'danjuan'
  pe?: ValuationMetric
  pb?: ValuationMetric
  hasHistory: boolean  // 是否有历史趋势数据
}

type CacheEntry = {
  expiresAt: number
  value: IndexValuationSource | undefined
}

const INDEX_VALUATION_CACHE_TTL_MS = 15 * 60 * 1000
const indexValuationCache = new Map<string, CacheEntry>()

export class IndexValuationRepository {
  constructor(
    private readonly eastmoneyDataSource: ValuationDataSource = createValuationDataSource(),
    private readonly danjuanAdapter: IndexValuationSnapshotAdapter = new DanjuanIndexValuationAdapter()
  ) {}

  /**
   * 获取指数估值数据（多数据源策略）
   *
   * 策略：
   * 1. 优先使用东方财富（有历史趋势数据）
   * 2. 降级到蛋卷基金（只有快照数据）
   */
  async getIndexValuation(indexName: string): Promise<IndexValuationSource | undefined> {
    const indexResult = await resolveIndexCode(indexName)
    if (!indexResult) {
      console.warn(`[IndexValuation] Cannot resolve index code for: ${indexName}`)
      return undefined
    }

    const { code: indexCode, name: resolvedName } = indexResult

    // 检查缓存
    const cached = indexValuationCache.get(indexCode)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }

    // 策略1: 优先使用东方财富（有历史趋势）
    const eastmoneyResult = await this.tryEastmoney(indexCode, resolvedName)
    if (eastmoneyResult) {
      this.cacheResult(indexCode, eastmoneyResult)
      return eastmoneyResult
    }

    // 策略2: 降级到蛋卷基金（只有快照）
    const danjuanResult = await this.tryDanjuan(indexCode, resolvedName)
    if (danjuanResult) {
      this.cacheResult(indexCode, danjuanResult)
      return danjuanResult
    }

    return undefined
  }

  private async tryEastmoney(indexCode: string, indexName: string): Promise<IndexValuationSource | undefined> {
    const [pe, pb] = await Promise.all([
      this.resolveEastmoneyMetric(indexCode, 1),
      this.resolveEastmoneyMetric(indexCode, 2)
    ])

    if (!pe && !pb) return undefined

    return {
      indexCode,
      indexName,
      source: 'eastmoney',
      pe,
      pb,
      hasHistory: true
    }
  }

  private async tryDanjuan(indexCode: string, indexName: string): Promise<IndexValuationSource | undefined> {
    const snapshot = await this.danjuanAdapter.getIndexSnapshot(indexCode)
    if (!snapshot) return undefined

    return {
      indexCode,
      indexName,
      source: 'danjuan',
      pe: {
        currentValue: snapshot.currentValue,
        currentPercentile: snapshot.currentPercentile,
        status: snapshot.status === 'low' ? '估值较低' : snapshot.status === 'high' ? '估值较高' : '估值中等',
        history: []  // 无历史数据
      },
      hasHistory: false
    }
  }

  private async resolveEastmoneyMetric(indexCode: string, indicatorType: 1 | 2): Promise<ValuationMetric | undefined> {
    const [snapshotResult, trendResult] = await Promise.allSettled([
      this.eastmoneyDataSource.getSnapshot(indexCode, indicatorType),
      this.eastmoneyDataSource.getTrend(indexCode, indicatorType)
    ])

    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : undefined
    const history = trendResult.status === 'fulfilled' ? trendResult.value : []

    return buildMetric(snapshot, history)
  }

  private cacheResult(indexCode: string, value: IndexValuationSource | undefined): void {
    indexValuationCache.set(indexCode, {
      expiresAt: Date.now() + INDEX_VALUATION_CACHE_TTL_MS,
      value
    })
  }
}
```

**设计要点**:
1. **多数据源策略**: 优先东方财富（有历史），降级蛋卷基金（只有快照）
2. **依赖倒置**: 依赖接口，不依赖具体实现
3. **缓存**: 独立的缓存实例，避免与股票估值缓存冲突
4. **错误隔离**: 指数估值失败不影响 ETF 其他数据
5. **动态解析**: 通过搜索接口获取指数代码，避免硬编码映射

### 3.3 Application Layer

#### 3.3.1 DTO 扩展

**文件**: `shared/contracts/api.ts`

```typescript
// 新增指数估值 DTO
export type IndexValuationDto = {
  indexCode: string
  indexName: string
  pe?: ValuationMetricDto
  pb?: ValuationMetricDto
}

// 扩展 AssetDetailModulesDto
export type AssetDetailModulesDto = {
  income?: IncomeAnalysisDto
  valuation?: ValuationSnapshotDto
  equity?: EquityAssetModuleDto
  fund?: FundAssetModuleDto
  risk?: RiskMetricsDto
  indexValuation?: IndexValuationDto  // 新增
}
```

#### 3.3.2 getAssetDetail 扩展

**文件**: `src/main/application/useCases/getAssetDetail.ts` (或现有 use case)

```typescript
// 在获取 ETF 详情时，额外获取指数估值
if (source.kind === 'ETF' && source.trackingIndex) {
  const indexValuation = await indexValuationRepository.getIndexValuation(source.trackingIndex)
  // 合并到返回结果
}
```

### 3.4 Mapper Layer

#### 3.4.1 toAssetDetailDto 扩展

**文件**: `src/main/application/mappers/stockDtoMappers.ts`

```typescript
// 在 toAssetDetailDto 函数中
export function toAssetDetailDto(
  source: StockAssetDetailSource | FundAssetDetailSource,
  indexValuation?: IndexValuationSource  // 新增参数
): AssetDetailDto {
  // ... 现有逻辑 ...

  if (source.kind === 'ETF') {
    return {
      // ... 现有字段 ...
      capabilities: {
        ...caps,
        hasValuationAnalysis: !!indexValuation  // 有指数估值时启用
      },
      modules: {
        // ... 现有模块 ...
        indexValuation: indexValuation ? {
          indexCode: indexValuation.indexCode,
          indexName: indexValuation.indexName,
          pe: toValuationMetricDto(indexValuation.pe),
          pb: toValuationMetricDto(indexValuation.pb)
        } : undefined
      }
    }
  }
}
```

### 3.5 Renderer Layer

#### 3.5.1 IndexValuationCard (新增)

**文件**: `src/renderer/src/components/stock-detail/IndexValuationCard.tsx`

**职责**: 展示指数估值概览卡片

```typescript
import { AppCard } from '@renderer/components/app/AppCard'
import type { IndexValuationDto, ValuationWindowKeyDto } from '@shared/contracts/api'

type IndexValuationCardProps = {
  indexValuation: IndexValuationDto
  valuationWindow: ValuationWindowKeyDto
}

/**
 * 指数估值概览卡片
 *
 * 展示：
 * 1. 指数名称和代码
 * 2. PE(TTM) 当前值 + 分位
 * 3. PB(MRQ) 当前值 + 分位
 * 4. 30/50/70 分位参考值
 */
export function IndexValuationCard({ indexValuation, valuationWindow }: IndexValuationCardProps) {
  // 复用现有估值卡片的样式和逻辑
  // 与股票估值卡片的区别：
  // 1. 标题显示"跟踪指数估值"而非"估值水平"
  // 2. 额外显示指数名称和代码
  // 3. 不显示 ROE（指数无此指标）
}
```

#### 3.5.2 IndexValuationTrendChart (新增)

**文件**: `src/renderer/src/components/stock-detail/IndexValuationTrendChart.tsx`

**职责**: 展示指数估值趋势图

```typescript
import { ValuationTrendChart } from './ValuationTrendChart'
import type { IndexValuationDto, ValuationWindowKeyDto } from '@shared/contracts/api'

type IndexValuationTrendChartProps = {
  indexValuation: IndexValuationDto
  valuationWindow: ValuationWindowKeyDto
}

/**
 * 指数估值趋势图
 *
 * 复用 ValuationTrendChart，适配 IndexValuationDto 数据结构
 */
export function IndexValuationTrendChart({ indexValuation, valuationWindow }: IndexValuationTrendChartProps) {
  // 将 IndexValuationDto 转换为 ValuationTrendChart 所需的 format
  // 然后委托给 ValuationTrendChart 渲染
}
```

#### 3.5.3 StockDetailPage 扩展

**文件**: `src/renderer/src/pages/StockDetailPage.tsx`

```typescript
// 在现有估值卡片之后，新增指数估值卡片
{data.assetType === 'ETF' && data.modules.indexValuation ? (
  <>
    <IndexValuationCard
      indexValuation={data.modules.indexValuation}
      valuationWindow={valuationWindow}
    />
    <IndexValuationTrendChart
      indexValuation={data.modules.indexValuation}
      valuationWindow={valuationWindow}
    />
  </>
) : null}
```

---

## 4. 文件清单

### 4.1 新增文件

| 文件路径 | 职责 |
|---------|------|
| `src/main/domain/services/indexCodeResolver.ts` | 通过搜索接口动态获取指数代码 |
| `src/main/adapters/danjuan/danjuanIndexValuationAdapter.ts` | 蛋卷基金指数估值适配器 |
| `src/main/repositories/indexValuationRepository.ts` | 指数估值数据获取（多数据源） |
| `src/renderer/src/components/stock-detail/IndexValuationCard.tsx` | 指数估值概览卡片 |
| `src/renderer/src/components/stock-detail/IndexValuationTrendChart.tsx` | 指数估值趋势图 |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `shared/contracts/api.ts` | 新增 `IndexValuationDto`，扩展 `AssetDetailModulesDto` |
| `src/main/application/mappers/stockDtoMappers.ts` | `toAssetDetailDto` 支持指数估值 |
| `src/main/application/useCases/getAssetDetail.ts` | ETF 详情获取时附加指数估值 |
| `src/renderer/src/pages/StockDetailPage.tsx` | 渲染指数估值卡片 |
| `src/main/repositories/assetProviderRegistry.ts` | `EtfAssetProvider` 注入 `IndexValuationRepository` |

### 4.3 测试文件

| 文件路径 | 测试内容 |
|---------|---------|
| `tests/domain/indexCodeResolver.test.ts` | 指数代码解析 |
| `tests/adapters/danjuanIndexValuationAdapter.test.ts` | 蛋卷基金适配器 |
| `tests/repositories/indexValuationRepository.test.ts` | 多数据源策略 |

---

## 5. 数据源验证结果与多数据源策略

### 5.1 数据源对比

| 数据源 | 接口 | 沪深300 | 创业板指 | 历史趋势 | 认证 |
|--------|------|---------|---------|---------|------|
| 东方财富 | `RPT_VALUATIONSTATUS` | ✗ | ✗ | ✓ | 无需 |
| 蛋卷基金 | `/djapi/index_eva/dj` | ✓ | ✓ | ✗ (需登录) | 无需 |
| 中证指数公司 | 官网 | ? | ? | ? | 无公开API |

**结论**: 单一数据源无法覆盖所有指数，需要多数据源策略。

### 5.2 多数据源策略

```
IndexValuationRepository
        │
        ▼
┌─────────────────────────────┐
│  Primary: 东方财富          │
│  - 快照 + 历史趋势          │
│  - 支持：上证50、中证500等  │
└─────────────────────────────┘
        │
        │ 失败
        ▼
┌─────────────────────────────┐
│  Fallback: 蛋卷基金        │
│  - 只有快照（PE/PB/分位）   │
│  - 支持：沪深300、创业板等  │
└─────────────────────────────┘
```

### 5.3 已验证的指数支持情况

#### 东方财富接口

| 指数名称 | 证券代码 | 快照 | 趋势 | PE值 | 分位 |
|---------|---------|------|------|------|------|
| 上证指数 | 000001 | ✓ | ✓ | 5.18 | 7.3% |
| 上证50 | 000016 | ✓ | ✓ | -0.61 | -- |
| 中证500 | 000905 | ✓ | ✓ | 82 | 92.26% |
| 中证1000 | 000852 | ✓ | ✓ | -5014 | -- |
| 中证红利 | 000922 | ✓ | ✓ | 36.76 | 76.49% |
| 红利指数 | 000015 | ✓ | ✓ | 519.45 | 99.49% |

#### 蛋卷基金接口

| 指数名称 | 指数代码 | PE | PB | PE分位 | PB分位 |
|---------|---------|-----|-----|--------|--------|
| 沪深300 | SH000300 | 14.64 | 1.46 | 92.32% | 50.68% |
| 创业板 | SZ399006 | 44.41 | 5.89 | 55.2% | 69.36% |

### 5.4 数据源选择逻辑

```typescript
async function getIndexValuation(indexName: string): Promise<IndexValuationSource | undefined> {
  // 1. 解析指数代码
  const indexResult = await resolveIndexCode(indexName)
  if (!indexResult) return undefined

  // 2. 优先使用东方财富（有历史趋势）
  const eastmoneyData = await fetchFromEastmoney(indexResult.code)
  if (eastmoneyData) {
    return { source: 'eastmoney', ...eastmoneyData }
  }

  // 3. 降级到蛋卷基金（只有快照）
  const danjuanData = await fetchFromDanjuan(indexResult.code)
  if (danjuanData) {
    return { source: 'danjuan', ...danjuanData }
  }

  return undefined
}
```

### 5.5 前端展示策略

#### 完整模式（东方财富数据）

```typescript
if (indexValuation.source === 'eastmoney') {
  // 显示完整估值卡片 + 趋势图
  <IndexValuationCard pe={...} pb={...} />
  <IndexValuationTrendChart history={...} />
}
```

#### 精简模式（蛋卷基金数据）

```typescript
if (indexValuation.source === 'danjuan') {
  // 只显示估值卡片，无趋势图
  <IndexValuationCard pe={...} pb={...} />
  <div className="ledger-stat-hint">数据来源：蛋卷基金（仅快照）</div>
}
```

#### 无数据模式

```typescript
if (!indexValuation) {
  <AppCard title="跟踪指数估值">
    <div className="ledger-valuation-status">
      暂无该指数的估值数据
    </div>
  </AppCard>
}
```

### 5.6 PE 负值处理

部分指数（如上证50、中证1000）的 PE 为负值，说明成分股整体亏损。处理策略：

1. **快照接口**: 分位数返回 `None`，状态返回空
2. **前端展示**: 显示 PE 值，但分位显示"--"，状态显示"PE 为负，暂无分位"
3. **趋势图**: 正常显示负 PE 趋势线，分位线跳过负值区间

---

## 6. 接口兼容性

### 6.1 向后兼容

- `AssetCapabilitiesDto.hasValuationAnalysis` 语义扩展：ETF 有指数估值时也为 `true`
- `AssetDetailModulesDto` 新增 `indexValuation` 可选字段，不影响现有逻辑
- 现有股票估值逻辑完全不受影响

### 6.2 前端降级

```typescript
// 前端渲染逻辑
const hasValuation = caps.hasValuationAnalysis && (
  data.valuation != null ||           // 股票估值
  data.modules.indexValuation != null  // 指数估值
)

// 渲染优先级：股票估值 > 指数估值
{hasValuation && data.valuation ? (
  <ValuationTrendChart ... />
) : null}

{data.modules.indexValuation ? (
  <IndexValuationTrendChart ... />
) : null}
```

---

## 7. 实施步骤

### Phase 1: Domain Layer (指数代码解析)

1. 创建 `src/main/domain/services/indexCodeResolver.ts`
2. 实现 `resolveIndexCode` 函数
3. 编写单元测试
4. 内置常见 A 股指数映射

### Phase 2: Repository Layer (指数估值获取)

1. 创建 `src/main/repositories/indexValuationRepository.ts`
2. 复用现有 `ValuationDataSource`
3. 实现缓存机制
4. 编写单元测试

### Phase 3: Application Layer (DTO 扩展)

1. 扩展 `shared/contracts/api.ts`，新增 `IndexValuationDto`
2. 扩展 `AssetDetailModulesDto`
3. 修改 `toAssetDetailDto` mapper
4. 修改 `getAssetDetail` use case

### Phase 4: Renderer Layer (UI 展示)

1. 创建 `IndexValuationCard` 组件
2. 创建 `IndexValuationTrendChart` 组件
3. 修改 `StockDetailPage`，渲染指数估值
4. 样式调优，确保与现有估值卡片风格一致

### Phase 5: 测试与优化

1. 集成测试：ETF 详情页完整流程
2. 边界测试：无 trackingIndex、指数不支持、接口失败
3. 性能优化：缓存策略、并发控制
4. 文档更新

---

## 8. 风险与注意事项

### 8.1 数据源风险 (已验证)

**验证结果** (2026-05-03):

| 数据源 | 优势 | 劣势 | 支持指数 |
|--------|------|------|---------|
| 东方财富 | 有历史趋势数据 | 部分指数不支持 | 上证50、中证500、中证红利等 |
| 蛋卷基金 | 支持沪深300、创业板 | 只有快照，无历史趋势 | 63个主要指数 |

**结论**: 单一数据源无法覆盖所有指数，采用多数据源策略。

### 8.2 蛋卷基金接口风险

**接口信息**:
- URL: `https://danjuanfunds.com/djapi/index_eva/dj`
- 无需认证
- 返回 63 个指数的估值快照

**风险**:
1. **非官方接口**: 蛋卷基金可能随时变更或下线接口
2. **无历史数据**: 只有当日快照，无法绘制趋势图
3. **数据延迟**: 可能有 1-2 天的延迟

**缓解措施**:
1. 作为降级方案，不影响主要功能
2. 前端明确标注数据来源和限制
3. 定期监控接口可用性

### 8.3 指数代码解析

**设计变更**: 不再硬编码映射表，改为通过搜索接口动态获取。

**优势**:
1. 自动适应指数名称变化
2. 自动支持新指数
3. 无需手动维护映射表

**风险**:
1. 搜索接口可能返回多个结果，需要匹配逻辑
2. 搜索接口可能有延迟或限流

**缓解措施**:
1. 结果缓存 24 小时，减少查询频率
2. 优先完全匹配，其次前缀匹配
3. 解析失败时静默跳过

### 8.4 性能考虑

- **并发控制**: ETF 详情页会同时请求 ETF 数据和指数估值，需确保不超过 SourceGateway 的并发限制
- **缓存策略**:
  - 指数代码解析结果：缓存 24 小时
  - 指数估值数据：缓存 15 分钟（与股票估值一致）
- **延迟加载**: 指数估值可考虑延迟加载，不阻塞 ETF 基础信息展示

### 8.5 用户体验

- **加载状态**: 指数估值加载时显示骨架屏或 loading
- **错误处理**: 指数估值获取失败时，显示友好提示而非整个页面报错
- **数据来源标注**:
  - 东方财富数据: 显示完整趋势图
  - 蛋卷基金数据: 只显示快照卡片，标注"数据来源：蛋卷基金（仅快照）"
- **PE 负值**: 显示"PE 为负，暂无分位"，避免用户困惑

---

## 9. 未来扩展

### 9.1 独立指数查询

- 支持直接搜索和查看指数（不通过 ETF）
- 指数详情页：估值、成分股、历史表现

### 9.2 指数对比

- 多指数估值对比
- 指数 vs 个股估值对比

### 9.3 智能推荐

- 基于估值分位的 ETF 推荐
- 低估值指数 ETF 筛选

### 9.4 自定义指数

- 用户自定义指数映射
- 从数据库或配置文件加载映射

---

## 10. 总结

本设计方案通过以下方式实现 ETF 跟踪指数估值分位图：

1. **复用现有基础设施**: 直接使用 `ValuationDataSource` 和 `valuationService`
2. **动态指数解析**: 通过搜索接口获取指数代码，避免硬编码映射
3. **新增指数估值仓储**: `IndexValuationRepository` 负责数据获取和缓存
4. **扩展 DTO 和 Mapper**: 在现有架构中无缝集成
5. **新增专用组件**: `IndexValuationCard` 和 `IndexValuationTrendChart`

**数据源验证结果** (2026-05-03):
- ✓ 东方财富估值接口支持大部分指数
- ✗ 部分指数不支持（沪深300、创业板指），需降级处理
- ⚠ 部分指数 PE 为负值，需特殊展示

整个方案遵循单一职责、依赖倒置、开闭原则，对现有代码侵入最小，且为未来扩展预留了充足空间。
