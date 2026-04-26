import type { AssetDetailDto } from '@shared/contracts/api'

export function getAverageYield(detail?: AssetDetailDto) {
  if (!detail || detail.yearlyYields.length === 0) {
    return undefined
  }
  return detail.yearlyYields.reduce((sum, item) => sum + item.yield, 0) / detail.yearlyYields.length
}

export function getYieldSnapshot(detail?: AssetDetailDto) {
  if (!detail) {
    return { value: undefined, label: undefined as string | undefined }
  }
  if (detail.futureYieldEstimate.isAvailable) {
    return {
      value: detail.futureYieldEstimate.estimatedFutureYield,
      label: '未来股息率'
    }
  }

  const averageYield = getAverageYield(detail)
  return {
    value: averageYield,
    label: averageYield != null ? '历史分配收益率' : undefined
  }
}
