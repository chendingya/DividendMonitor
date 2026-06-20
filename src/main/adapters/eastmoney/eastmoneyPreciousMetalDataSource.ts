import type {
  PreciousMetalDataSource,
  PreciousMetalDetailSource,
  PreciousMetalSearchSource
} from '@main/adapters/contracts'
import type { AssetType } from '@shared/contracts/api'
import type { HistoricalPricePoint, DividendEvent } from '@main/domain/entities/Stock'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'

type PreciousMetalQuotePayload = {
  f43?: number
  f57?: string
  f58?: string
}

type PreciousMetalMeta = {
  code: string
  name: string
  assetType: Extract<AssetType, 'GOLD' | 'SILVER'>
  purity: string
  keywords: string[]
}

const PRECIOUS_METAL_CATALOG: PreciousMetalMeta[] = [
  {
    code: 'AU9999',
    name: '黄金99.99',
    assetType: 'GOLD',
    purity: '99.99%',
    keywords: ['黄金', 'gold', 'au', 'au9999', '金', '积存金', '9999']
  },
  {
    code: 'AU9995',
    name: '黄金99.95',
    assetType: 'GOLD',
    purity: '99.95%',
    keywords: ['黄金995', 'au9995', '黄金99.95']
  },
  {
    code: 'AG9999',
    name: '白银99.99',
    assetType: 'SILVER',
    purity: '99.99%',
    keywords: ['白银', 'silver', 'ag', 'ag9999', '银', '9999']
  }
]

const EXCHANGE_NAME = '上海黄金交易所'

const INTERNATIONAL_CODES: Record<string, string> = {
  GOLD: 'hf_XAU',
  SILVER: 'hf_XAG'
}

function matchCatalog(keyword: string): PreciousMetalMeta[] {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return []
  return PRECIOUS_METAL_CATALOG.filter((meta) => {
    if (meta.code.toLowerCase().includes(normalized)) return true
    if (meta.name.includes(keyword.trim())) return true
    return meta.keywords.some((kw) => kw.toLowerCase().includes(normalized) || normalized.includes(kw.toLowerCase()))
  })
}

function toSearchSource(meta: PreciousMetalMeta): PreciousMetalSearchSource {
  return {
    assetType: meta.assetType,
    code: meta.code,
    name: meta.name,
    market: 'SGE',
    purity: meta.purity
  }
}

export class EastmoneyPreciousMetalDataSource implements PreciousMetalDataSource {
  async search(keyword: string): Promise<PreciousMetalSearchSource[]> {
    return matchCatalog(keyword).map(toSearchSource)
  }

  private async getQuote(code: string, assetType: Extract<AssetType, 'GOLD' | 'SILVER'>): Promise<PreciousMetalQuotePayload> {
    const response = await getDefaultSourceGateway().request<{ code: string }, PreciousMetalQuotePayload>({
      capability: 'asset.quote',
      routeContext: { assetType, market: 'SGE', code },
      input: { code }
    })
    if (!response.data || response.data.f43 == null) {
      throw new Error(`No quote data for precious metal ${code}`)
    }
    return response.data
  }

  private async getKline(code: string): Promise<HistoricalPricePoint[]> {
    try {
      const response = await getDefaultSourceGateway().request<{ code: string; fqt: 0 | 1; lmt: number }, HistoricalPricePoint[]>({
        capability: 'asset.kline',
        routeContext: { assetType: 'GOLD', market: 'SGE', code },
        input: { code, fqt: 0, lmt: 2000 }
      })
      return response.data
    } catch {
      return []
    }
  }

  private async getInternationalQuote(assetType: Extract<AssetType, 'GOLD' | 'SILVER'>): Promise<number | undefined> {
    const sinaCode = INTERNATIONAL_CODES[assetType]
    if (!sinaCode) return undefined
    try {
      const response = await getDefaultSourceGateway().request<{ code: string }, PreciousMetalQuotePayload>({
        capability: 'asset.quote',
        routeContext: { assetType, market: 'SGE', code: sinaCode },
        input: { code: sinaCode }
      })
      return response.data?.f43
    } catch {
      return undefined
    }
  }

  async getDetail(code: string, assetType: Extract<AssetType, 'GOLD' | 'SILVER'>): Promise<PreciousMetalDetailSource> {
    const normalizedCode = code.trim().toUpperCase()
    const meta = PRECIOUS_METAL_CATALOG.find((m) => m.code === normalizedCode && m.assetType === assetType)
    if (!meta) {
      throw new Error(`Unknown precious metal contract: ${assetType}:${code}`)
    }

    const [quotePayload, internationalPriceUsdPerOz, priceHistory] = await Promise.all([
      this.getQuote(normalizedCode, assetType),
      this.getInternationalQuote(assetType),
      this.getKline(normalizedCode)
    ])

    const latestPrice = quotePayload.f43 ?? 0
    if (latestPrice <= 0) {
      throw new Error(`Invalid latest price for ${normalizedCode}: ${latestPrice}`)
    }

    const dividendEvents: DividendEvent[] = []

    return {
      assetType,
      code: normalizedCode,
      name: quotePayload.f58?.trim() || meta.name,
      market: 'SGE',
      purity: meta.purity,
      exchangeName: EXCHANGE_NAME,
      latestPrice,
      internationalPriceUsdPerOz,
      priceHistory,
      dividendEvents,
      dataSource: 'eastmoney'
    }
  }

  async compare(codes: string[], assetType: Extract<AssetType, 'GOLD' | 'SILVER'>): Promise<PreciousMetalDetailSource[]> {
    const results = await Promise.allSettled(codes.map((code) => this.getDetail(code, assetType)))
    return results.map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      throw result.reason instanceof Error ? result.reason : new Error(`Failed to load ${codes[i]}`)
    })
  }
}
