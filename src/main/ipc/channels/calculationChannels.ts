import { ipcMain } from 'electron'
import { estimateFutureYield } from '@main/application/useCases/estimateFutureYield'
import { getHistoricalYield } from '@main/application/useCases/getHistoricalYield'
import { runDividendReinvestmentBacktest } from '@main/application/useCases/runDividendReinvestmentBacktest'

export function registerCalculationChannels() {
  ipcMain.handle('calculation:historical-yield', async (_event, symbol: string) => {
    return getHistoricalYield(symbol)
  })

  ipcMain.handle('calculation:estimate-future-yield', async (_event, symbol: string) => {
    return estimateFutureYield(symbol)
  })

  ipcMain.handle('calculation:run-dividend-reinvestment-backtest', async (_event, symbol: string, buyDate: string) => {
    return runDividendReinvestmentBacktest(symbol, buyDate)
  })
}
