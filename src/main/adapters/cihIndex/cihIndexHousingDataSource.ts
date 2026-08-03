import type {
  HousingMarketDataSource,
  HousingMarketSnapshot
} from '@main/adapters/contracts'
import type {
  HousingMarketSnapshotInput,
  HousingMarketSnapshotOutput,
  HousingMarketSnapshotType
} from '@main/infrastructure/dataSources/types/sourceTypes'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'

/**
 * 中指研究院房价行情数据源（SSR 页面 window.__INITIAL_STATE__ 提取）。
 * 提供百城新建/二手样本均价与 50 城住宅租金（元/㎡·月），月度更新，含近 12 个月趋势。
 */
export class CihIndexHousingDataSource implements HousingMarketDataSource {
  private async fetch(type: HousingMarketSnapshotType): Promise<HousingMarketSnapshotOutput> {
    const input: HousingMarketSnapshotInput = { type }
    const response = await getDefaultSourceGateway().request<HousingMarketSnapshotInput, HousingMarketSnapshotOutput>({
      capability: 'housing.marketSnapshot',
      input
    })
    return response.data
  }

  async getNewHouseSnapshot(): Promise<HousingMarketSnapshot> {
    return this.fetch('newHouse')
  }

  async getEsfHouseSnapshot(): Promise<HousingMarketSnapshot> {
    return this.fetch('esfHouse')
  }

  async getRentSnapshot(): Promise<HousingMarketSnapshot> {
    return this.fetch('rentIndex')
  }
}
