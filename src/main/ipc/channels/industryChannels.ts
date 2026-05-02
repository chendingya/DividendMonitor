import { ipcMain } from 'electron'
import { getIndustryAnalysis, getIndustryDistribution, getIndustryBenchmark } from '@main/application/useCases/getIndustryAnalysis'

export function registerIndustryChannels() {
  ipcMain.handle('industry:analysis', async (_event, industryName?: string, assetKeys?: string[]) => {
    return getIndustryAnalysis(industryName, assetKeys)
  })

  ipcMain.handle('industry:distribution', async () => {
    return getIndustryDistribution()
  })

  ipcMain.handle('industry:benchmark', async (_event, industryName: string) => {
    return getIndustryBenchmark(industryName)
  })
}
