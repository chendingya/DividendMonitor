import { ipcMain } from 'electron'
import type { AssetBacktestRequestDto, AssetQueryDto } from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { estimateFutureYieldForAsset } from '@main/application/useCases/estimateFutureYieldForAsset'
import { getHistoricalYieldForAsset } from '@main/application/useCases/getHistoricalYieldForAsset'
import { runDividendReinvestmentBacktestForAsset } from '@main/application/useCases/runDividendReinvestmentBacktestForAsset'

export function registerCalculationChannels() {
  ipcMain.handle('calculation:historical-yield', async (_event, symbol: string) => {
    return getHistoricalYieldForAsset(createStockAssetQuery(symbol))
  })

  ipcMain.handle('calculation:estimate-future-yield', async (_event, symbol: string) => {
    return estimateFutureYieldForAsset(createStockAssetQuery(symbol))
  })

  ipcMain.handle('calculation:run-dividend-reinvestment-backtest', async (_event, symbol: string, buyDate: string) => {
    return runDividendReinvestmentBacktestForAsset({
      asset: createStockAssetQuery(symbol),
      buyDate
    })
  })

  ipcMain.handle('calculation:historical-yield-for-asset', async (_event, request: AssetQueryDto) => {
    return getHistoricalYieldForAsset(request)
  })

  ipcMain.handle('calculation:estimate-future-yield-for-asset', async (_event, request: AssetQueryDto) => {
    return estimateFutureYieldForAsset(request)
  })

  ipcMain.handle('calculation:run-dividend-reinvestment-backtest-for-asset', async (_event, request: AssetBacktestRequestDto) => {
    return runDividendReinvestmentBacktestForAsset(request)
  })
}
