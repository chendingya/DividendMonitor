import type {
  EndpointDefinition,
  HousingMarketSnapshotInput,
  HousingMarketSnapshotOutput,
  HousingMarketSnapshotType,
  HousingCitySnapshot,
  HousingMarketTrendPoint
} from '@main/infrastructure/dataSources/types/sourceTypes'

const PAGE_URLS: Record<HousingMarketSnapshotType, string> = {
  newHouse: 'https://www.cih-index.com/data/index/newHouse.html',
  esfHouse: 'https://www.cih-index.com/data/index/esfHouse.html',
  rentIndex: 'https://www.cih-index.com/data/index/rentIndex.html'
}

type CihCityEntry = {
  city?: string
  average?: number | null
  median?: number | null
  averageHuanBi?: number | null
  averageTongBi?: number | null
}

type CihTrendEntry = {
  date?: string
  average?: number | null
  averageHuanBi?: number | null
  averageTongBi?: number | null
}

type CihState = {
  data?: {
    type?: string
    topInfoDate?: string
    topInfo?: {
      average?: number | null
      median?: number | null
      averageUnit?: string
      averageHuanBi?: number | null
      averageTongBi?: number | null
    }
    chartData?: CihTrendEntry[]
    cityIndexInfo?: CihCityEntry[]
  }
}

/** 提取 SSR 内嵌的 window.__INITIAL_STATE__ JSON */
export function extractCihInitialState(html: string): CihState {
  const marker = 'window.__INITIAL_STATE__='
  const start = html.indexOf(marker) + marker.length
  if (start < marker.length) {
    throw new Error('__INITIAL_STATE__ not found in page')
  }
  const end = html.indexOf('</script>', start)
  if (end < 0) {
    throw new Error('script block not found')
  }
  const raw = html.slice(start, end)
  try {
    return JSON.parse(raw) as CihState
  } catch {
    // SSR HTML may append trailing tags after the state object; trim to last '}'
    return JSON.parse(raw.slice(0, raw.lastIndexOf('}') + 1)) as CihState
  }
}

export function parseCihMarketSnapshot(html: string, type: HousingMarketSnapshotType): HousingMarketSnapshotOutput {
  const state = extractCihInitialState(html)
  const data = state.data

  const period = (data?.topInfoDate ?? '').replace('.', '-')

  const cities: HousingCitySnapshot[] = (data?.cityIndexInfo ?? [])
    .filter((item) => item.city)
    .map((item) => ({
      city: item.city as string,
      pricePerSqm: item.average ?? undefined,
      medianPerSqm: item.median ?? undefined,
      momPercent: item.averageHuanBi ?? undefined,
      yoyPercent: item.averageTongBi ?? undefined
    }))

  const trend: HousingMarketTrendPoint[] = (data?.chartData ?? [])
    .filter((item) => item.date)
    .map((item) => ({
      period: item.date as string,
      pricePerSqm: item.average ?? undefined,
      momPercent: item.averageHuanBi ?? undefined,
      yoyPercent: item.averageTongBi ?? undefined
    }))
    .sort((left, right) => left.period.localeCompare(right.period))

  return {
    type,
    period,
    unit: data?.topInfo?.averageUnit ?? '',
    nationalAverage: data?.topInfo?.average ?? undefined,
    nationalMedian: data?.topInfo?.median ?? undefined,
    nationalMomPercent: data?.topInfo?.averageHuanBi ?? undefined,
    nationalYoyPercent: data?.topInfo?.averageTongBi ?? undefined,
    cities,
    trend
  }
}

export const cihMarketSnapshotEndpoint: EndpointDefinition<
  HousingMarketSnapshotInput,
  string,
  HousingMarketSnapshotOutput
> = {
  id: 'cih.housing.marketSnapshot',
  provider: 'cih',
  capability: 'housing.marketSnapshot',
  parser: 'text',
  method: 'GET',
  timeoutMs: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Referer: 'https://www.cih-index.com/'
  },
  buildUrl: ({ type }) => PAGE_URLS[type],
  mapResponse: (html, input) => parseCihMarketSnapshot(html, input.type)
}

export const cihEndpoints = [
  cihMarketSnapshotEndpoint
]
