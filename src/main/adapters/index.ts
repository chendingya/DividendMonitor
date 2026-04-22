import type { AShareDataSource } from '@main/adapters/AShareDataSource'
import { EastmoneyAShareDataSource } from '@main/adapters/eastmoney/eastmoneyAShareDataSource'
import type { DataSourceMode } from '@main/infrastructure/config/appConfig'
import { getAppConfig } from '@main/infrastructure/config/appConfig'

export function createAShareDataSource(mode: DataSourceMode = getAppConfig().dataSourceMode): AShareDataSource {
  if (mode !== 'eastmoney') {
    throw new Error(`Unsupported A-share data source mode: ${mode}`)
  }

  return new EastmoneyAShareDataSource()
}

