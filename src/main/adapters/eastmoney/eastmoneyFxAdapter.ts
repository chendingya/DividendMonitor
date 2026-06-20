import type { FxDataSource, FxRateSource } from '@main/adapters/contracts'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'
import type { FxQuoteInput, FxQuoteOutput } from '@main/infrastructure/dataSources/types/sourceTypes'

export class SinaFxAdapter implements FxDataSource {
  async getRate(pair: string): Promise<FxRateSource> {
    const normalized = pair.trim().toUpperCase()
    const sinaPair = normalized === 'USDCNH' ? 'fx_susdcnh' : normalized.toLowerCase()
    const response = await getDefaultSourceGateway().request<FxQuoteInput, FxQuoteOutput>({
      capability: 'fx.quote',
      input: { pair: sinaPair }
    })

    const rate = response.data.rate
    if (!rate || rate <= 0) {
      throw new Error(`Invalid FX rate for ${normalized}: ${rate}`)
    }

    return {
      pair: normalized,
      rate,
      name: response.data.name,
      fetchedAt: response.data.fetchedAt
    }
  }
}
