import { getJson } from '@main/infrastructure/http/httpClient'

export type DanjuanIndexValuationSource = {
  currentValue: number
  currentPercentile: number
  status: 'low' | 'medium' | 'high'
}

export interface IndexValuationSnapshotAdapter {
  getIndexSnapshot(indexCode: string, market?: 'SH' | 'SZ'): Promise<DanjuanIndexValuationSource | undefined>
}

type DanjuanIndexItem = {
  index_code?: string
  pe?: number
  pb?: number
  pe_percentile?: number
  pb_percentile?: number
}

type DanjuanApiResponse = {
  data?: {
    items?: DanjuanIndexItem[]
    list?: DanjuanIndexItem[]
  }
  items?: DanjuanIndexItem[]
  list?: DanjuanIndexItem[]
}

function toDanjuanCode(code: string, market: 'SH' | 'SZ'): string {
  return `${market}${code}`
}

function deriveStatus(percentile: number): 'low' | 'medium' | 'high' {
  if (percentile <= 30) return 'low'
  if (percentile >= 70) return 'high'
  return 'medium'
}

export class DanjuanIndexValuationAdapter implements IndexValuationSnapshotAdapter {
  private cachedItems: DanjuanIndexItem[] | undefined
  private cacheExpiresAt = 0

  async getIndexSnapshot(indexCode: string, market: 'SH' | 'SZ' = 'SH'): Promise<DanjuanIndexValuationSource | undefined> {
    const items = await this.fetchItems()
    const danjuanCode = toDanjuanCode(indexCode, market)

    const match = items.find((item) => item.index_code === danjuanCode)
    if (!match || match.pe == null || match.pe_percentile == null) {
      return undefined
    }

    return {
      currentValue: match.pe,
      currentPercentile: match.pe_percentile * 100,
      status: deriveStatus(match.pe_percentile * 100)
    }
  }

  private async fetchItems(): Promise<DanjuanIndexItem[]> {
    if (this.cachedItems && Date.now() < this.cacheExpiresAt) {
      return this.cachedItems
    }

    try {
      const response = await getJson<DanjuanApiResponse>('https://danjuanfunds.com/djapi/index_eva/dj')
      const items = response.data?.items ?? response.data?.list ?? response.items ?? response.list ?? []

      this.cachedItems = items
      this.cacheExpiresAt = Date.now() + 15 * 60 * 1000

      return items
    } catch {
      return []
    }
  }
}
