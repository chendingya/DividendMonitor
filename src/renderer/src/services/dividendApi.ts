import { requestJson } from '@renderer/services/httpClient'

export type DividendHistoryRequest = {
  fromDate?: string
  toDate?: string
  assetKeys?: string[]
}

export type DividendHistoryItem = {
  assetKey: string
  assetName: string
  code: string
  year: number
  exDate: string
  dividendPerShare: number
  bonusSharePer10?: number
  transferSharePer10?: number
  referenceClosePrice: number
  heldShares: number
  estimatedDividendAmount: number
}

export type DividendYearlySummary = {
  year: number
  totalAmount: number
  eventCount: number
  assetCount: number
}

export type DividendMonthlyTrend = {
  month: string
  amount: number
}

export type DividendAssetSummary = {
  assetKey: string
  assetName: string
  code: string
  totalAmount: number
  eventCount: number
  latestExDate: string
}

export type DividendHistoryResult = {
  items: DividendHistoryItem[]
  yearlySummary: DividendYearlySummary[]
  monthlyTrend: DividendMonthlyTrend[]
  assetSummary: DividendAssetSummary[]
  totalAmount: number
}

export const dividendApi = {
  getHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult> {
    return requestJson<DividendHistoryResult>('/api/dividend/history', {
      method: 'POST',
      body: request ?? {}
    })
  }
}
