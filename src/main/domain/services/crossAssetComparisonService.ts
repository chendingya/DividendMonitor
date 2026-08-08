import type { CrossAssetComparisonDto, CrossAssetPointDto } from '@shared/contracts/api'

export type CrossAssetStockSource = {
  assetKey: string
  name: string
  code?: string
  symbol?: string
  yieldPercent?: number
  volatilityPercent?: number
  industry?: string
}

export type CrossAssetHousingSource = {
  city: string
  yieldPercent?: number
  volatilityPercent?: number
  pricePerSqm?: number
}

export type CrossAssetComparisonSource = {
  stocks: CrossAssetStockSource[]
  housing: CrossAssetHousingSource[]
  riskFreeRatePercent?: number
  generatedAt?: string
}

const DEFAULT_RISK_FREE_RATE = 2.5

function formatPercent(value: number | undefined): string {
  return value == null ? '--' : `${value.toFixed(2)}%`
}

function toStockPoint(source: CrossAssetStockSource): CrossAssetPointDto {
  return {
    id: source.assetKey,
    kind: 'stock',
    name: source.name,
    code: source.code ?? source.symbol,
    yieldPercent: source.yieldPercent,
    volatilityPercent: source.volatilityPercent,
    yieldLabel: source.yieldPercent == null ? undefined : '估算股息率',
    subInfo: source.industry,
    detailPath: `/stock-detail?assetKey=${encodeURIComponent(source.assetKey)}`
  }
}

function toHousingPoint(source: CrossAssetHousingSource): CrossAssetPointDto {
  return {
    id: source.city,
    kind: 'housing',
    name: source.city,
    city: source.city,
    yieldPercent: source.yieldPercent,
    volatilityPercent: source.volatilityPercent,
    yieldLabel: source.yieldPercent == null ? undefined : '租金收益率',
    subInfo: source.pricePerSqm != null ? `均价 ${source.pricePerSqm.toFixed(0)} 元/㎡` : undefined,
    detailPath: `/housing/${encodeURIComponent(source.city)}`
  }
}

/**
 * 将股票（自选/持仓）与房产（关注城市）统一为散点坐标系中的资产点。
 * 收益率 = 股息率 / 租金收益率；波动率 = 股票年化波动率 / 房价指数年化波动率。
 * 任一维度缺失时仍保留该点（表格可见），仅散点图跳过不完整点。
 * 排序：有收益率的按收益率降序，无收益率的排在末尾。
 */
export function buildCrossAssetComparison(
  source: CrossAssetComparisonSource
): CrossAssetComparisonDto {
  const points: CrossAssetPointDto[] = [
    ...source.stocks.map(toStockPoint),
    ...source.housing.map(toHousingPoint)
  ].sort((left, right) => {
    const leftYield = left.yieldPercent ?? -1
    const rightYield = right.yieldPercent ?? -1
    return rightYield - leftYield
  })

  return {
    points,
    riskFreeRatePercent: source.riskFreeRatePercent ?? DEFAULT_RISK_FREE_RATE,
    stockCount: source.stocks.length,
    housingCount: source.housing.length,
    generatedAt: source.generatedAt ?? new Date().toISOString()
  }
}

export { formatPercent }
