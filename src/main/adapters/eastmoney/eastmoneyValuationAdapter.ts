import type {
  ValuationDataSource,
  ValuationIndicatorType,
  ValuationSnapshotSource
} from '@main/adapters/contracts'
import { toIsoDate, toNumber } from '@main/adapters/eastmoney/eastmoneyUtils'
import type { ValuationTrendPoint } from '@main/domain/services/valuationService'
import { getJson } from '@main/infrastructure/http/httpClient'

type EastmoneyDataCenterResponse<T> = {
  result?: {
    data?: T[]
    pages?: number
    count?: number
  }
}

type EastmoneyValuationStatusRecord = {
  INDEX_VALUE?: number
  INDEX_PERCENTILE?: number
  VALATION_STATUS?: string
}

type EastmoneyValuationTrendRecord = {
  TRADE_DATE?: string
  INDICATOR_VALUE?: number
}

const EASTMONEY_DATA_CENTER_BASE_URL = 'https://datacenter.eastmoney.com/securities/api/data/get'

function buildHeaders() {
  return {
    Referer: 'https://emdata.eastmoney.com/',
    Origin: 'https://emdata.eastmoney.com'
  }
}

async function fetchTrendPage(symbol: string, indicatorType: ValuationIndicatorType, page: number, pageSize: number) {
  const url =
    `${EASTMONEY_DATA_CENTER_BASE_URL}?type=RPT_CUSTOM_DMSK_TREND` +
    `&sr=-1&st=TRADE_DATE&p=${page}&ps=${pageSize}&var=source=DataCenter&client=WAP` +
    `&filter=${encodeURIComponent(`(SECURITY_CODE="${symbol}")(INDICATORTYPE=${indicatorType})(DATETYPE=2)`)}`

  return getJson<EastmoneyDataCenterResponse<EastmoneyValuationTrendRecord>>(url, {
    headers: buildHeaders()
  })
}

export class EastmoneyValuationAdapter implements ValuationDataSource {
  async getSnapshot(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationSnapshotSource | undefined> {
    const url =
      `${EASTMONEY_DATA_CENTER_BASE_URL}?type=RPT_VALUATIONSTATUS` +
      '&sty=SECUCODE,TRADE_DATE,INDICATOR_TYPE,INDEX_VALUE,INDEX_PERCENTILE,VALATION_STATUS' +
      '&callback=&extraCols=&p=1&ps=1&sr=&st=&token=&var=source=DataCenter&client=WAP' +
      `&filter=${encodeURIComponent(`(SECURITY_CODE="${symbol}")(INDICATOR_TYPE="${indicatorType}")`)}`

    try {
      const payload = await getJson<EastmoneyDataCenterResponse<EastmoneyValuationStatusRecord>>(url, {
        headers: buildHeaders()
      })
      const record = payload.result?.data?.[0]

      if (!record) {
        return undefined
      }

      return {
        currentValue: toNumber(record.INDEX_VALUE) ?? undefined,
        currentPercentile: toNumber(record.INDEX_PERCENTILE) ?? undefined,
        status: record.VALATION_STATUS
      }
    } catch {
      return undefined
    }
  }

  async getTrend(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationTrendPoint[]> {
    const pageSize = 2000

    try {
      const firstPage = await fetchTrendPage(symbol, indicatorType, 1, pageSize)
      const pages = Math.max(1, firstPage.result?.pages ?? 1)
      const payloads = [firstPage]

      for (let page = 2; page <= pages; page += 1) {
        payloads.push(await fetchTrendPage(symbol, indicatorType, page, pageSize))
      }

      return payloads
        .flatMap((payload) => payload.result?.data ?? [])
        .map((record) => {
          const date = toIsoDate(record.TRADE_DATE)
          const value = toNumber(record.INDICATOR_VALUE)
          if (!date || value == null || value <= 0) {
            return null
          }

          return {
            date,
            value
          }
        })
        .filter((item): item is ValuationTrendPoint => item != null)
        .sort((left, right) => right.date.localeCompare(left.date))
    } catch {
      return []
    }
  }
}
