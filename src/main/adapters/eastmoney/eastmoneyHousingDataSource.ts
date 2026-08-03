import type {
  HousingDataSource,
  HousingPriceIndexRecord
} from '@main/adapters/contracts'
import type { HousingPriceIndexOutput } from '@main/infrastructure/dataSources/types/sourceTypes'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'

/**
 * 东财 70 城房价指数数据源（RPT_ECONOMY_HOUSE_PRICE）。
 * 数据来源：国家统计局 70 城商品住宅销售价格指数（月度，2011-01 至今）。
 * Spike 验证用适配器。
 */
export class EastmoneyHousingDataSource implements HousingDataSource {
  private async fetch(input: { city?: string; period?: string; startDate?: string; endDate?: string }): Promise<HousingPriceIndexRecord[]> {
    const response = await getDefaultSourceGateway().request<{ city?: string; period?: string; startDate?: string; endDate?: string }, HousingPriceIndexOutput>({
      capability: 'housing.priceIndex',
      input
    })
    return response.data.records
  }

  async getLatestSnapshot(period?: string): Promise<HousingPriceIndexRecord[]> {
    return this.fetch({ period })
  }

  async getCityHistory(city: string): Promise<HousingPriceIndexRecord[]> {
    return this.fetch({ city })
  }

  async getRange(requests: Array<{ city: string; period?: string }>): Promise<HousingPriceIndexRecord[]> {
    const results = await Promise.allSettled(
      requests.map(({ city, period }) => this.fetch({ city, period }))
    )
    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value
      throw result.reason instanceof Error
        ? result.reason
        : new Error(`Failed to fetch housing index for ${requests[index].city}`)
    })
  }
}
