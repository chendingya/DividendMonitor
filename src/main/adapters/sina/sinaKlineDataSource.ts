import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'

/**
 * Fetch daily K-line from Sina Finance API.
 * Returns unadjusted (不复权) closing prices, most recent N bars.
 *
 * @param code Stock/ETF code
 * @param datalen Number of bars to fetch (default 5000 = all history)
 */
export async function fetchSinaDailyKline(
  code: string,
  datalen = 5000
): Promise<HistoricalPricePoint[]> {
  try {
    const response = await getDefaultSourceGateway().request<{ code: string; datalen: number }, HistoricalPricePoint[]>({
      capability: 'asset.kline',
      providerHint: 'sina',
      input: {
        code,
        datalen
      }
    })
    return response.data
  } catch {
    return []
  }
}
