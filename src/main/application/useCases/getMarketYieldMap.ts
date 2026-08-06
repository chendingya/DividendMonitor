import type { MarketYieldMapDto, YieldMapIndustryDto } from '@shared/contracts/api'
import { buildYieldMap, buildIndustryYieldMap, type YieldMapStockEntry } from '@main/domain/services/yieldMapService'
import { YieldMapRepository } from '@main/repositories/yieldMapRepository'
import { SupabaseYieldMapRepository } from '@main/repositories/supabaseYieldMapRepository'
import { getYieldMapRepository } from '@main/repositories/repositoryFactory'
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

function cloudRepository(): SupabaseYieldMapRepository | null {
  const repo = getYieldMapRepository()
  return repo instanceof SupabaseYieldMapRepository ? repo : null
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

  // 在线且本地无股票快照时，先用云端行业级快照兜底（股票级留空，页面提示等待本地刷新）
  const cloud = cloudRepository()
  if (cloud) {
    const { snapshotDate, industries } = await cloud.getLatestIndustries().catch(() => ({
      snapshotDate: null as string | null,
      industries: [] as YieldMapIndustryDto[]
    }))
    if (industries.length > 0) {
      return { industries, stocks: [], partial: true, stockCount: 0, fetchedAt: snapshotDate ?? undefined }
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
  const dto = toDto(entries, fetchedAt)

  // 在线模式额外上传行业级快照到云端（失败不阻断本地结果；不 await，避免拖慢刷新响应）
  const cloud = cloudRepository()
  if (cloud) {
    const snapshotDate = (fetchedAt ?? new Date().toISOString()).slice(0, 10)
    void cloud.upsertIndustries(dto.industries, snapshotDate).catch((error) => {
      console.warn('[YieldMap] 上传行业快照到云端失败:', error instanceof Error ? error.message : error)
    })
  }

  return dto
}
