import type { AShareDataSource, FundCatalogDataSource, FundDetailDataSource, ValuationDataSource } from '@main/adapters/contracts'
import { EastmoneyAShareDataSource } from '@main/adapters/eastmoney/eastmoneyAShareDataSource'
import { EastmoneyFundCatalogAdapter } from '@main/adapters/eastmoney/eastmoneyFundCatalogAdapter'
import { EastmoneyFundDetailDataSource } from '@main/adapters/eastmoney/eastmoneyFundDetailDataSource'
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

export function createFundCatalogDataSource(mode: DataSourceMode = getAppConfig().dataSourceMode): FundCatalogDataSource {
  if (mode !== 'eastmoney') {
    throw new Error(`Unsupported fund catalog data source mode: ${mode}`)
  }

  return new EastmoneyFundCatalogAdapter()
}

export function createFundDetailDataSource(mode: DataSourceMode = getAppConfig().dataSourceMode): FundDetailDataSource {
  if (mode !== 'eastmoney') {
    throw new Error(`Unsupported fund detail data source mode: ${mode}`)
  }

  return new EastmoneyFundDetailDataSource()
}
