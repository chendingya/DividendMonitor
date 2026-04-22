import { getCalculationDesktopApi } from '@renderer/services/desktopApi'

export const calculationApi = {
  getHistoricalYield(symbol: string) {
    return getCalculationDesktopApi().getHistoricalYield(symbol)
  },
  estimateFutureYield(symbol: string) {
    return getCalculationDesktopApi().estimateFutureYield(symbol)
  },
  runDividendReinvestmentBacktest(symbol: string, buyDate: string) {
    return getCalculationDesktopApi().runDividendReinvestmentBacktest(symbol, buyDate)
  }
}

