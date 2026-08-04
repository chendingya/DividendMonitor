import type {
  MarketClistOutput,
  MarketDividendOutput,
  MarketQuoteRecord,
  MarketDividendRecord
} from '@main/infrastructure/dataSources/types/sourceTypes'
import type { YieldMapDataSource } from '@main/adapters/contracts'
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'

const CONCURRENCY = 10
const CLIST_PAGE_SIZE = 100
const DIVIDEND_PAGE_SIZE = 500
const PAGE_CACHE_TTL_MS = 60 * 60 * 1000

async function fetchPages<TInput, TOutput>(
  capability: 'market.clist' | 'market.dividend',
  _firstPage: TOutput,
  total: number,
  pageSize: number,
  inputFor: (page: number) => TInput,
  keyFor: (page: number) => string
): Promise<Array<TOutput extends { records: unknown } ? TOutput['records'] : never>> {
  const pageCount = Math.ceil(total / pageSize)
  const pagesToFetch = Math.max(0, pageCount - 1)
  const results: unknown[] = []

  for (let start = 0; start < pagesToFetch; start += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, pagesToFetch - start) },
      (_unused, index) => start + index + 2
    )
    const settled = await Promise.allSettled(
      batch.map((page) =>
        getDefaultSourceGateway().request<TInput, TOutput>({
          capability,
          input: inputFor(page),
          cacheKey: keyFor(page),
          cacheTtlMs: PAGE_CACHE_TTL_MS
        })
      )
    )
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(
          result.value.data as TOutput extends { records: unknown } ? TOutput['records'] : never
        )
      }
    }
  }
  return results as Array<TOutput extends { records: unknown } ? TOutput['records'] : never>
}

export class EastmoneyYieldMapDataSource implements YieldMapDataSource {
  async fetchAllQuotes(): Promise<MarketQuoteRecord[]> {
    const first = await getDefaultSourceGateway().request<
      { page: number; pageSize: number },
      MarketClistOutput
    >({
      capability: 'market.clist',
      input: { page: 1, pageSize: CLIST_PAGE_SIZE },
      cacheKey: 'yield-map:clist:1',
      cacheTtlMs: PAGE_CACHE_TTL_MS
    })
    const rest = await fetchPages(
      'market.clist',
      first.data,
      first.data.total,
      CLIST_PAGE_SIZE,
      (page) => ({ page, pageSize: CLIST_PAGE_SIZE }),
      (page) => `yield-map:clist:${page}`
    )
    return [first.data.records, ...rest].flat()
  }

  async fetchAllDividendEvents(): Promise<MarketDividendRecord[]> {
    const first = await getDefaultSourceGateway().request<
      { page: number; pageSize: number },
      MarketDividendOutput
    >({
      capability: 'market.dividend',
      input: { page: 1, pageSize: DIVIDEND_PAGE_SIZE },
      cacheKey: 'yield-map:dividend:1',
      cacheTtlMs: PAGE_CACHE_TTL_MS
    })
    const rest = await fetchPages(
      'market.dividend',
      first.data,
      first.data.total,
      DIVIDEND_PAGE_SIZE,
      (page) => ({ page, pageSize: DIVIDEND_PAGE_SIZE }),
      (page) => `yield-map:dividend:${page}`
    )
    return [first.data.records, ...rest].flat()
  }
}
