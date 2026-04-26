import type { AssetBacktestRequestDto, AssetQueryDto } from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { getCalculationDesktopApi } from '@renderer/services/desktopApi'

export const calculationApi = {
  getHistoricalYield(symbol: string) {
    return getCalculationDesktopApi().getHistoricalYieldForAsset(createStockAssetQuery(symbol))
  },
  getHistoricalYieldForAsset(request: AssetQueryDto) {
    return getCalculationDesktopApi().getHistoricalYieldForAsset(request)
  },
  estimateFutureYield(symbol: string) {
    return getCalculationDesktopApi().estimateFutureYieldForAsset(createStockAssetQuery(symbol))
  },
  estimateFutureYieldForAsset(request: AssetQueryDto) {
    return getCalculationDesktopApi().estimateFutureYieldForAsset(request)
  },
  runDividendReinvestmentBacktest(symbol: string, buyDate: string) {
    return getCalculationDesktopApi().runDividendReinvestmentBacktestForAsset({
      asset: createStockAssetQuery(symbol),
      buyDate
    })
  },
  runDividendReinvestmentBacktestForAsset(request: AssetBacktestRequestDto) {
    return getCalculationDesktopApi().runDividendReinvestmentBacktestForAsset(request)
  }
}

