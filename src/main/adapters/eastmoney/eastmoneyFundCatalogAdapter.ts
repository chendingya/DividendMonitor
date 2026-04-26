import type { FundCatalogDataSource, FundSearchSource } from '@main/adapters/contracts'
import { getJson } from '@main/infrastructure/http/httpClient'

type EastmoneySuggestResponse = {
  Quotations?: EastmoneySuggestItem[]
  QuotationCodeTable?: {
    Data?: EastmoneySuggestItem[]
  }
}

type EastmoneySuggestItem = {
  Code?: string
  Name?: string
  SecurityTypeName?: string
  SecurityType?: string
  Classify?: string
}

const SEARCH_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8'

function isSixDigitFundCode(code: string) {
  return /^\d{6}$/.test(code)
}

function isLikelyEtfCode(code: string) {
  return /^(5\d{5}|1[15]\d{4})$/.test(code)
}

export function resolveFundAssetType(item: EastmoneySuggestItem): FundSearchSource['assetType'] | null {
  const descriptor = `${item.Classify ?? ''}|${item.SecurityTypeName ?? ''}|${item.SecurityType ?? ''}`.toLowerCase()
  const rawDescriptor = `${item.Classify ?? ''}|${item.SecurityTypeName ?? ''}|${item.SecurityType ?? ''}`
  const name = item.Name?.trim() ?? ''
  const code = item.Code?.trim() ?? ''

  if (descriptor.includes('etf') || /etf/i.test(name)) {
    return 'ETF'
  }

  if (code && isLikelyEtfCode(code) && rawDescriptor.includes('场内基金')) {
    return 'ETF'
  }

  if (
    descriptor.includes('fund') ||
    descriptor.includes('lof') ||
    rawDescriptor.includes('基金') ||
    rawDescriptor.includes('场内基金')
  ) {
    return 'FUND'
  }

  return null
}

export class EastmoneyFundCatalogAdapter implements FundCatalogDataSource {
  async search(keyword: string, assetType?: FundSearchSource['assetType']): Promise<FundSearchSource[]> {
    const normalized = keyword.trim()
    if (!normalized) {
      return []
    }

    const url =
      `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(normalized)}` +
      `&type=14&token=${SEARCH_TOKEN}&count=20`
    const payload = await getJson<EastmoneySuggestResponse>(url)
    const quotations = payload.Quotations ?? payload.QuotationCodeTable?.Data ?? []

    const seen = new Set<string>()
    const results: FundSearchSource[] = []

    for (const item of quotations) {
      const code = item.Code?.trim() ?? ''
      const name = item.Name?.trim() ?? ''
      if (!code || !name || !isSixDigitFundCode(code)) {
        continue
      }

      const resolvedType = resolveFundAssetType(item)
      if (!resolvedType) {
        continue
      }

      if (assetType && resolvedType !== assetType) {
        continue
      }

      const dedupeKey = `${resolvedType}:${code}`
      if (seen.has(dedupeKey)) {
        continue
      }
      seen.add(dedupeKey)

      results.push({
        assetType: resolvedType,
        code,
        name,
        market: 'A_SHARE'
      })
    }

    return results
  }
}
