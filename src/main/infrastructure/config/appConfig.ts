export type DataSourceMode = 'eastmoney'

export type AppConfig = {
  dataSourceMode: DataSourceMode
}

export function getAppConfig(): AppConfig {
  return { dataSourceMode: 'eastmoney' }
}
