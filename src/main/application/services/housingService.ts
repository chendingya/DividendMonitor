import type {
  HousingCityDetailDto,
  HousingCitySummaryDto,
  HousingIndexPointDto,
  HousingPriceTrendPointDto,
  UserHousingDataUpsertDto
} from '@shared/contracts/api'
import { EastmoneyHousingDataSource } from '@main/adapters/eastmoney/eastmoneyHousingDataSource'
import { CihIndexHousingDataSource } from '@main/adapters/cihIndex/cihIndexHousingDataSource'
import {
  HousingIndexCacheRepository,
  HousingWatchlistRepository,
  UserHousingDataRepository
} from '@main/repositories/housingRepository'
import { calculateHousingDerivedMetrics, rebuildIndexSeries } from '@main/domain/services/housingCalculationService'
import type { HousingIndexRecord } from '@main/domain/entities/Housing'

export class HousingService {
  private readonly eastmoney = new EastmoneyHousingDataSource()
  private readonly cih = new CihIndexHousingDataSource()
  private readonly userDataRepo = new UserHousingDataRepository()
  private readonly watchlistRepo = new HousingWatchlistRepository()
  private readonly indexCacheRepo = new HousingIndexCacheRepository()

  async listCities(): Promise<HousingCitySummaryDto[]> {
    const [newHouse, esfHouse, rent, watchlist] = await Promise.all([
      this.cih.getNewHouseSnapshot(),
      this.cih.getEsfHouseSnapshot(),
      this.cih.getRentSnapshot(),
      Promise.resolve(this.watchlistRepo.list())
    ])

    const watchedSet = new Set(watchlist.map((item) => item.cityCode))
    const newHouseByCity = new Map(newHouse.cities.map((item) => [item.city, item]))
    const esfByCity = new Map(esfHouse.cities.map((item) => [item.city, item]))
    const rentByCity = new Map(rent.cities.map((item) => [item.city, item]))

    const cities = new Set<string>([
      ...newHouse.cities.map((item) => item.city),
      ...rent.cities.map((item) => item.city)
    ])

    const results: HousingCitySummaryDto[] = []
    for (const city of cities) {
      const newHome = newHouseByCity.get(city)
      const esf = esfByCity.get(city)
      const rentInfo = rentByCity.get(city)
      const pricePerSqm = newHome?.pricePerSqm ?? esf?.pricePerSqm
      const rentPerSqm = rentInfo?.pricePerSqm
      const metrics = calculateHousingDerivedMetrics({ rentPerSqm, pricePerSqm })

      results.push({
        city,
        pricePerSqm,
        secondHandPricePerSqm: esf?.pricePerSqm,
        rentPerSqm,
        momPercent: newHome?.momPercent,
        yoyPercent: newHome?.yoyPercent,
        rentalYieldPercent: metrics.rentalYieldPercent,
        priceToRentRatio: metrics.priceToRentRatio,
        isWatched: watchedSet.has(city)
      })
    }

    return results.sort((left, right) => left.city.localeCompare(right.city))
  }

  async getCityDetail(city: string): Promise<HousingCityDetailDto> {
    const [newHouse, esfHouse, rent, indexHistory, userData] = await Promise.all([
      this.cih.getNewHouseSnapshot(),
      this.cih.getEsfHouseSnapshot(),
      this.cih.getRentSnapshot(),
      this.fetchIndexHistory(city),
      Promise.resolve(this.userDataRepo.findByCity(city))
    ])
    const newHome = newHouse.cities.find((item) => item.city === city)
    const esf = esfHouse.cities.find((item) => item.city === city)
    const rentInfo = rent.cities.find((item) => item.city === city)

    // 用户手动数据优先（区/小区级精细化，总价/整套月租口径）
    const effectivePrice = userData?.priceTotalYuan ?? newHome?.pricePerSqm ?? esf?.pricePerSqm
    const effectiveRent = userData?.rentTotalMonthYuan ?? rentInfo?.pricePerSqm
    const metrics = calculateHousingDerivedMetrics({ rentPerSqm: effectiveRent, pricePerSqm: effectivePrice })

    const priceTrend: HousingPriceTrendPointDto[] = (newHouse.trend ?? []).map((point) => ({
      period: point.period,
      pricePerSqm: point.pricePerSqm,
      momPercent: point.momPercent
    }))

    const rentTrend: HousingPriceTrendPointDto[] = (rent.trend ?? []).map((point) => ({
      period: point.period,
      pricePerSqm: point.pricePerSqm,
      momPercent: point.momPercent
    }))

    return {
      city,
      period: newHouse.period,
      unit: newHouse.unit,
      pricePerSqm: newHome?.pricePerSqm,
      secondHandPricePerSqm: esf?.pricePerSqm,
      rentPerSqm: rentInfo?.pricePerSqm,
      momPercent: newHome?.momPercent,
      yoyPercent: newHome?.yoyPercent,
      rentalYieldPercent: metrics.rentalYieldPercent,
      priceToRentRatio: metrics.priceToRentRatio,
      indexHistory,
      indexSeries: this.buildIndexSeries(indexHistory),
      priceTrend,
      rentTrend,
      userData: userData
        ? {
            district: userData.district,
            community: userData.community,
            priceTotalYuan: userData.priceTotalYuan,
            rentTotalMonthYuan: userData.rentTotalMonthYuan,
            note: userData.note,
            updatedAt: userData.updatedAt
          }
        : undefined
    }
  }

  /** 缓存优先读取 70 城指数：本地 SQLite（30 天 TTL）→ 东财回源并写缓存 → 回源失败用过期缓存兜底 */
  private async fetchIndexHistory(city: string): Promise<HousingIndexPointDto[]> {
    // 统一按 reportDate 升序（旧 → 新）：东财返回降序、缓存返回升序，不依赖来源顺序
    const toDto = (records: HousingIndexRecord[]): HousingIndexPointDto[] =>
      records
        .slice()
        .sort((left, right) => left.reportDate.localeCompare(right.reportDate))
        .map((record) => ({
          reportDate: record.reportDate,
          newHomeMoM: record.newHomeMoM,
          newHomeYoY: record.newHomeYoY,
          secondHandMoM: record.secondHandMoM,
          secondHandYoY: record.secondHandYoY
        }))

    const cached = this.indexCacheRepo.findByCity(city)
    if (cached) {
      return toDto(cached)
    }

    try {
      const records: HousingIndexRecord[] = await this.eastmoney.getCityHistory(city)
      if (records.length > 0) {
        this.indexCacheRepo.upsertMany(city, records)
      }
      return toDto(records)
    } catch {
      const stale = this.indexCacheRepo.findByCity(city, { allowStale: true })
      return stale ? toDto(stale) : []
    }
  }

  /** 环比连乘重建连续指数序列（定基指数停发后的替代：基准 100，逐月 × MoM/100） */
  private buildIndexSeries(history: HousingIndexPointDto[]) {
    // history 已是升序（旧 → 新）；rebuildIndexSeries 要求升序，从最早月锚定 100 向后连乘
    const newHomeSeries = rebuildIndexSeries(
      history.map((item) => ({ reportDate: item.reportDate, secondHandMoM: item.newHomeMoM })),
      100
    )
    const secondHandSeries = rebuildIndexSeries(
      history.map((item) => ({ reportDate: item.reportDate, secondHandMoM: item.secondHandMoM })),
      100
    )

    const byDate = new Map<string, { newHomeIndex: number; secondHandIndex: number }>()
    for (const point of newHomeSeries) {
      byDate.set(point.reportDate, { newHomeIndex: point.index, secondHandIndex: 100 })
    }
    for (const point of secondHandSeries) {
      const existing = byDate.get(point.reportDate)
      if (existing) {
        existing.secondHandIndex = point.index
      } else {
        byDate.set(point.reportDate, { newHomeIndex: 100, secondHandIndex: point.index })
      }
    }

    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reportDate, values]) => ({
        reportDate,
        newHomeIndex: Number(values.newHomeIndex.toFixed(2)),
        secondHandIndex: Number(values.secondHandIndex.toFixed(2))
      }))
  }

  watchCity(city: string): void {
    this.watchlistRepo.add(city, city)
  }

  unwatchCity(city: string): void {
    this.watchlistRepo.remove(city)
  }

  updateUserData(request: UserHousingDataUpsertDto): void {
    this.userDataRepo.upsert({
      cityCode: request.city,
      district: request.district,
      community: request.community,
      priceTotalYuan: request.priceTotalYuan,
      rentTotalMonthYuan: request.rentTotalMonthYuan,
      note: request.note
    })
  }

  removeUserData(city: string): void {
    this.userDataRepo.remove(city)
  }
}
