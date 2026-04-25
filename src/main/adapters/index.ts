import type { AShareDataSource, ValuationDataSource } from '@main/adapters/contracts'
import { EastmoneyAShareDataSource } from '@main/adapters/eastmoney/eastmoneyAShareDataSource'
import { EastmoneyValuationAdapter } from '@main/adapters/eastmoney/eastmoneyValuationAdapter'
import type { DataSourceMode } from '@main/infrastructure/config/appConfig'
import { getAppConfig } from '@main/infrastructure/config/appConfig'

export function createAShareDataSource(mode: DataSourceMode = getAppConfig().dataSourceMode): AShareDataSource {
  if (mode !== 'eastmoney') {
    throw new Error(`Unsupported A-share data source mode: ${mode}`)
  }

  return new EastmoneyAShareDataSource()
}

export function createValuationDataSource(mode: DataSourceMode = getAppConfig().dataSourceMode): ValuationDataSource {
  if (mode !== 'eastmoney') {
    throw new Error(`Unsupported valuation data source mode: ${mode}`)
  }

  return new EastmoneyValuationAdapter()
}

