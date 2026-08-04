import type { MarketYieldMapDto } from '@shared/contracts/api'
import { buildYieldMap, buildIndustryYieldMap, type YieldMapStockEntry } from '@main/domain/services/yieldMapService'
import { YieldMapRepository } from '@main/repositories/yieldMapRepository'
import { EastmoneyYieldMapDataSource } from '@main/adapters/eastmoney/eastmoneyYieldMapDataSource'

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000

const repository = new YieldMapRepository()
const dataSource = new EastmoneyYieldMapDataSource()

function toDto(entries: YieldMapStockEntry[], fetchedAt: string | null): MarketYieldMapDto {
  return {
    industries: buildIndustryYieldMap(entries),
    stocks: entries.map((entry) => ({
      assetKey: entry.assetKey,
      symbol: entry.symbol,
      name: entry.name,
      industry: entry.industry,
      price: entry.price,
      yieldTtm: entry.yieldTtm
    })),
    fetchedAt: fetchedAt ?? undefined,
    partial: false,
    stockCount: entries.length
  }
}

export async function getMarketYieldMap(): Promise<MarketYieldMapDto> {
  const fetchedAt = repository.getFetchedAt()
  if (fetchedAt) {
    const age = Date.now() - new Date(fetchedAt).getTime()
    if (age >= 0 && age < SNAPSHOT_TTL_MS) {
      const entries = repository.getAll()
      if (entries.length > 0) {
        return toDto(entries, fetchedAt)
      }
    }
  }
  return refreshMarketYieldMap()
}

export async function refreshMarketYieldMap(): Promise<MarketYieldMapDto> {
  const [quotes, events] = await Promise.all([
    dataSource.fetchAllQuotes(),
    dataSource.fetchAllDividendEvents()
  ])
  const entries = buildYieldMap(quotes, events)
  repository.replaceAll(entries)
  const fetchedAt = repository.getFetchedAt()
  return toDto(entries, fetchedAt)
}
