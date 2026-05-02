import type {
  ValuationDataSource,
  ValuationIndicatorType,
  ValuationSnapshotSource
} from '@main/adapters/contracts'
import type { ValuationTrendPoint } from '@main/domain/services/valuationService'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'
import type {
  ValuationPercentileInput,
  ValuationTrendInput
} from '@main/infrastructure/dataSources/types/sourceTypes'

export class EastmoneyValuationAdapter implements ValuationDataSource {
  async getSnapshot(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationSnapshotSource | undefined> {
    try {
      const response = await getDefaultSourceGateway().request<ValuationPercentileInput, { currentValue?: number; currentPercentile?: number; status?: string }>({
        capability: 'valuation.percentile',
        input: { code: symbol, indicatorType }
      })

      const data = response.data
      if (data.currentValue == null && data.currentPercentile == null) {
        return undefined
      }

      return {
        currentValue: data.currentValue,
        currentPercentile: data.currentPercentile,
        status: data.status
      }
    } catch (err) {
      console.warn(`[Valuation] Percentile failed for ${symbol} type=${indicatorType}: ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    }
  }

  async getTrend(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationTrendPoint[]> {
    try {
      const response = await getDefaultSourceGateway().request<ValuationTrendInput, ValuationTrendPoint[]>({
        capability: 'valuation.trend',
        input: { code: symbol, indicatorType }
      })

      // Filter by indicatorType: PE_TTM for type 1, PB_MRQ for type 2
      // The endpoint already returns data sorted by date descending
      return response.data
    } catch {
      return []
    }
  }
}
