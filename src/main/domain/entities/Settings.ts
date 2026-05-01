export type RefreshStrategy = 'manual' | 'onLaunch' | 'interval'

export type SortMetric = 'estimatedFutureYield' | 'averageYield' | 'peRatio' | 'roe'

export type SettingsEntity = {
  defaultYearRange: [number, number]
  defaultSortMetric: SortMetric
  refreshStrategy: RefreshStrategy
  refreshIntervalMinutes: number
  backtestInitialCapital: number
  backtestIncludeFees: boolean
  backtestFeeRate: number
  backtestStampDutyRate: number
  backtestMinCommission: number
}

const currentYear = new Date().getFullYear()

export const DEFAULT_SETTINGS: SettingsEntity = {
  defaultYearRange: [currentYear - 5, currentYear] as [number, number],
  defaultSortMetric: 'estimatedFutureYield',
  refreshStrategy: 'manual',
  refreshIntervalMinutes: 30,
  backtestInitialCapital: 100000,
  backtestIncludeFees: false,
  backtestFeeRate: 0.0003,
  backtestStampDutyRate: 0.0005,
  backtestMinCommission: 5
}
