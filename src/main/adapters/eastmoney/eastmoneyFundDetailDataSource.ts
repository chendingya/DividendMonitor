import type { AssetType } from '@shared/contracts/api'
import type { FundDetailDataSource, FundDetailSource } from '@main/adapters/contracts'
import type { DividendEvent, HistoricalPricePoint } from '@main/domain/entities/Stock'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'
import type { EastmoneyFundQuotePayload } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'
import type { TencentEtfKlineData } from '@main/infrastructure/dataSources/registry/tencentEndpoints'
import type {
  AssetProfileInput,
  AssetProfileOutput,
  AssetDividendInput,
  AssetDividendOutput
} from '@main/infrastructure/dataSources/types/sourceTypes'
import { fetchSinaDailyKline } from '@main/adapters/sina/sinaKlineDataSource'
import { getPriceCacheRepository } from '@main/repositories/repositoryFactory'

async function fetchTencentEtfKlines(code: string): Promise<TencentEtfData> {
  try {
    const response = await getDefaultSourceGateway().request<{ code: string }, TencentEtfKlineData>({
      capability: 'asset.kline',
      providerHint: 'tencent',
      routeContext: {
        assetType: 'ETF',
        market: 'A_SHARE',
        code
      },
      input: {
        code
      }
    })
    return response.data
  } catch {
    return EMPTY_TENCENT_DATA
  }
}

function normalizeQuotePrice(value: number | undefined) {
  if (value == null || value <= 0) {
    return undefined
  }

  const price = value >= 1000 ? value / 1000 : value
  return Number.isFinite(price) && price > 0 ? price : undefined
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function resolveFundDisplayName(input: {
  basicProfileName?: string
  quoteName?: string
  tencentName?: string
  code: string
}) {
  return normalizeOptionalText(input.basicProfileName) ?? normalizeOptionalText(input.quoteName) ?? normalizeOptionalText(input.tencentName) ?? input.code.trim()
}

type TencentEtfData = {
  klines: HistoricalPricePoint[]
  name?: string
  latestPrice?: number
}

const EMPTY_TENCENT_DATA: TencentEtfData = { klines: [] }

export class EastmoneyFundDetailDataSource implements FundDetailDataSource {
  async getDetail(code: string, assetType: Extract<AssetType, 'ETF' | 'FUND'>): Promise<FundDetailSource> {
    const normalizedCode = code.trim()

    // Check local price cache — historical data is immutable
    const priceCache = getPriceCacheRepository()
    let cachedPrices: HistoricalPricePoint[] = []
    let cacheIsFresh = false

    if (assetType === 'ETF') {
      cachedPrices = priceCache.getPriceHistory(normalizedCode)
      const cachedLatest = priceCache.getLatestDate(normalizedCode)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().slice(0, 10)
      cacheIsFresh = cachedLatest != null && cachedLatest >= yesterdayStr
    }

    // SourceGateway's ConcurrencyLimiter ensures no more than 1 concurrent
    // request per provider, so Promise.allSettled is safe here.
    const [profileResult, quoteResult, klineResult, tencentResult, sinaResult] = await Promise.allSettled([
      getDefaultSourceGateway().request<AssetProfileInput, AssetProfileOutput>({
        capability: 'asset.profile',
        routeContext: { assetType, market: 'A_SHARE', code: normalizedCode },
        input: { code: normalizedCode }
      }),
      getDefaultSourceGateway().request<{ code: string }, EastmoneyFundQuotePayload>({
        capability: 'asset.quote',
        providerHint: 'eastmoney',
        routeContext: { assetType, market: 'A_SHARE', code: normalizedCode },
        input: { code: normalizedCode }
      }).then((response) => response.data),
      getDefaultSourceGateway().request<{ code: string; fqt: 0 | 1; lmt: number }, HistoricalPricePoint[]>({
        capability: 'asset.kline',
        providerHint: 'eastmoney',
        routeContext: { assetType, market: 'A_SHARE', code: normalizedCode },
        input: { code: normalizedCode, fqt: 0, lmt: 800 }
      }).then((response) => response.data),
      assetType === 'ETF' ? fetchTencentEtfKlines(normalizedCode) : Promise.resolve(EMPTY_TENCENT_DATA),
      assetType === 'ETF'
        ? (cacheIsFresh
            ? Promise.resolve(cachedPrices)
            : (() => {
                const latest = priceCache.getLatestDate(normalizedCode)
                const needed = latest
                  ? Math.max(10, Math.ceil(
                      (Date.now() - new Date(latest).getTime()) / (1000 * 60 * 60 * 24) * 5 / 7
                    ) + 10)
                  : 5000
                return fetchSinaDailyKline(normalizedCode, needed)
              })())
        : Promise.resolve([] as HistoricalPricePoint[])
    ])

    // Log failures for debugging
    if (profileResult.status === 'rejected') {
      console.warn(`[EastmoneyFund] Profile failed for ${normalizedCode}: ${profileResult.reason instanceof Error ? profileResult.reason.message : String(profileResult.reason)}`)
    }
    if (quoteResult.status === 'rejected') {
      console.warn(`[EastmoneyFund] Quote API failed for ${normalizedCode}: ${quoteResult.reason instanceof Error ? quoteResult.reason.message : String(quoteResult.reason)}`)
    }
    if (klineResult.status === 'rejected') {
      console.warn(`[EastmoneyFund] Kline API failed for ${normalizedCode}: ${klineResult.reason instanceof Error ? klineResult.reason.message : String(klineResult.reason)}`)
    }

    const basicProfile = profileResult.status === 'fulfilled' ? profileResult.value.data : {}
    const quotePayload = quoteResult.status === 'fulfilled' ? quoteResult.value : ({} as EastmoneyFundQuotePayload)
    const eastmoneyKlines = klineResult.status === 'fulfilled' ? klineResult.value : []
    const tencentData = tencentResult.status === 'fulfilled' ? tencentResult.value : EMPTY_TENCENT_DATA

    // For FUND type, require profile to be available
    if (assetType === 'FUND' && profileResult.status !== 'fulfilled') {
      throw new Error(`Fund basic profile unavailable for ${normalizedCode} (fund.eastmoney.com unreachable)`)
    }

    // For ETF type, allow fallback to Tencent data when fund.eastmoney.com fails
    if (assetType === 'ETF' && profileResult.status !== 'fulfilled' && tencentData.klines.length === 0) {
      throw new Error(`ETF data unavailable for ${normalizedCode}: both fund.eastmoney.com and Tencent API failed`)
    }

    const tencentKlines = tencentData.klines

    const fetchedKlines = sinaResult.status === 'fulfilled' ? sinaResult.value : []

    // Only merge into cache when we actually fetched new data (cache miss/stale).
    let sinaKlines = cachedPrices
    if (assetType === 'ETF' && !cacheIsFresh && fetchedKlines.length > 0) {
      priceCache.savePriceHistory(normalizedCode, fetchedKlines)
      sinaKlines = priceCache.getPriceHistory(normalizedCode)
    }

    const quotePrice = normalizeQuotePrice(quotePayload?.f43)

    // Pick the best price history: Sina (full history, 不复权) > Tencent > Eastmoney.
    const bestAltHistory = tencentKlines.length > eastmoneyKlines.length ? tencentKlines : eastmoneyKlines
    const priceHistory: HistoricalPricePoint[] =
      assetType === 'FUND'
        ? []
        : sinaKlines.length > 0
          ? sinaKlines
          : bestAltHistory

    const lastKlineClose = priceHistory[priceHistory.length - 1]?.close ?? tencentData.latestPrice
    const unitNav = basicProfile.latestNav

    const latestPrice =
      assetType === 'FUND'
        ? (unitNav ?? quotePrice ?? lastKlineClose)
        : (quotePrice ?? tencentData.latestPrice ?? lastKlineClose ?? unitNav)

    if (!latestPrice) {
      throw new Error(`Fund latest price / NAV is unavailable: ${normalizedCode}`)
    }

    // Phase 2: Fetch dividend events with price context
    let dividendEvents: DividendEvent[] = []
    if (profileResult.status === 'fulfilled') {
      try {
        const dividendResponse = await getDefaultSourceGateway().request<AssetDividendInput, AssetDividendOutput>({
          capability: 'asset.dividend',
          routeContext: { assetType, market: 'A_SHARE', code: normalizedCode },
          input: { code: normalizedCode, priceHistory, fallbackPrice: latestPrice }
        })
        dividendEvents = dividendResponse.data.events
      } catch {
        // Dividend data is optional
      }
    }

    return {
      assetType,
      code: normalizedCode,
      name: resolveFundDisplayName({
        basicProfileName: basicProfile.name,
        quoteName: quotePayload?.f58,
        tencentName: tencentData.name,
        code: normalizedCode
      }),
      market: 'A_SHARE',
      category: basicProfile.category,
      manager: basicProfile.manager,
      trackingIndex: basicProfile.trackingIndex,
      benchmark: basicProfile.benchmark,
      latestPrice,
      latestNav: basicProfile.latestNav,
      fundScale: basicProfile.fundScale,
      priceHistory,
      dividendEvents,
      dataSource: 'eastmoney'
    }
  }
}
