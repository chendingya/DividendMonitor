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
import type { HousingIndexRecord, UserHousingData } from '@main/domain/entities/Housing'

function deriveMetrics(pricePerSqm: number | undefined, rentPerSqm: number | undefined, userData?: UserHousingData) {
  const hasCustomAmounts = userData?.priceTotalYuan != null || userData?.rentTotalMonthYuan != null
  // 整套金额必须成对使用，不能与自动行情的每平方米单价混算。
  return {
    ...calculateHousingDerivedMetrics(hasCustomAmounts
      ? { pricePerSqm: userData?.priceTotalYuan, rentPerSqm: userData?.rentTotalMonthYuan }
      : { pricePerSqm, rentPerSqm }),
    yieldSource: hasCustomAmounts ? 'custom' as const : 'market' as const
  }
}

export class HousingService {
  private readonly eastmoney = new EastmoneyHousingDataSource()
  private readonly cih = new CihIndexHousingDataSource()
  private readonly userDataRepo = new UserHousingDataRepository()
  private readonly watchlistRepo = new HousingWatchlistRepository()
  private readonly indexCacheRepo = new HousingIndexCacheRepository()
  private readonly loadedDetails = new Map<string, HousingCityDetailDto>()
  private readonly changedCities = new Set<string>()

  async listCities(): Promise<HousingCitySummaryDto[]> {
    const [newHouse, esfHouse, rent, watchlist, userData] = await Promise.all([
      this.cih.getNewHouseSnapshot(),
      this.cih.getEsfHouseSnapshot(),
      this.cih.getRentSnapshot(),
      this.watchlistRepo.list(),
      this.userDataRepo.list()
    ])

    const watchedSet = new Set(watchlist.map((item) => item.cityCode))
    const newHouseByCity = new Map(newHouse.cities.map((item) => [item.city, item]))
    const esfByCity = new Map(esfHouse.cities.map((item) => [item.city, item]))
    const rentByCity = new Map(rent.cities.map((item) => [item.city, item]))
    const userDataByCity = new Map(userData.map((item) => [item.cityCode, item]))

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
      const metrics = deriveMetrics(pricePerSqm, rentPerSqm, userDataByCity.get(city))

      results.push({
        city,
        pricePerSqm,
        secondHandPricePerSqm: esf?.pricePerSqm,
        rentPerSqm,
        momPercent: newHome?.momPercent,
        yoyPercent: newHome?.yoyPercent,
        rentalYieldPercent: metrics.rentalYieldPercent,
        priceToRentRatio: metrics.priceToRentRatio,
        yieldSource: metrics.yieldSource,
        isWatched: watchedSet.has(city)
      })
    }

    return results.sort((left, right) => left.city.localeCompare(right.city))
  }

  async getCityDetail(city: string): Promise<HousingCityDetailDto> {
    const previous = this.loadedDetails.get(city)
    if (previous && this.changedCities.has(city)) {
      // 保存/清除只改变本地参数，复用已展示的市场快照和指数，避免把回源失败当成写入失败。
      const detail = this.withUserData(previous, await this.userDataRepo.findByCity(city))
      this.loadedDetails.set(city, detail)
      this.changedCities.delete(city)
      return detail
    }

    const [newHouse, esfHouse, rent, indexHistory] = await Promise.all([
      this.cih.getNewHouseSnapshot(),
      this.cih.getEsfHouseSnapshot(),
      this.cih.getRentSnapshot(),
      this.fetchIndexHistory(city)
    ])
    // 市场请求期间也可能完成本地保存，在返回前读取最新的用户记录。
    const userData = await this.userDataRepo.findByCity(city)
    const newHome = newHouse.cities.find((item) => item.city === city)
    const esf = esfHouse.cities.find((item) => item.city === city)
    const rentInfo = rent.cities.find((item) => item.city === city)

    // 用户手动数据优先（区/小区级精细化，总价/整套月租口径）
    const metrics = deriveMetrics(newHome?.pricePerSqm ?? esf?.pricePerSqm, rentInfo?.pricePerSqm, userData)

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

    const detail: HousingCityDetailDto = {
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
      yieldSource: metrics.yieldSource,
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
    this.loadedDetails.set(city, detail)
    this.changedCities.delete(city)
    return detail
  }

  private withUserData(detail: HousingCityDetailDto, userData?: UserHousingData): HousingCityDetailDto {
    const metrics = deriveMetrics(detail.pricePerSqm ?? detail.secondHandPricePerSqm, detail.rentPerSqm, userData)
    return {
      ...detail,
      rentalYieldPercent: metrics.rentalYieldPercent,
      priceToRentRatio: metrics.priceToRentRatio,
      yieldSource: metrics.yieldSource,
      userData: userData ? {
        district: userData.district,
        community: userData.community,
        priceTotalYuan: userData.priceTotalYuan,
        rentTotalMonthYuan: userData.rentTotalMonthYuan,
        note: userData.note,
        updatedAt: userData.updatedAt
      } : undefined
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

    const cached = (await this.indexCacheRepo.findByCity(city))
    if (cached) {
      return toDto(cached)
    }

    try {
      const records: HousingIndexRecord[] = await this.eastmoney.getCityHistory(city)
      if (records.length > 0) {
        await this.indexCacheRepo.upsertMany(city, records)
      }
      return toDto(records)
    } catch {
      const stale = (await this.indexCacheRepo.findByCity(city, { allowStale: true }))
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

  async watchCity(city: string): Promise<void> {
    await this.watchlistRepo.add(city, city)
  }

  async unwatchCity(city: string): Promise<void> {
    await this.watchlistRepo.remove(city)
  }

  async updateUserData(request: UserHousingDataUpsertDto): Promise<void> {
    await this.userDataRepo.upsert({
      cityCode: request.city,
      district: request.district,
      community: request.community,
      priceTotalYuan: request.priceTotalYuan,
      rentTotalMonthYuan: request.rentTotalMonthYuan,
      note: request.note
    })
    this.changedCities.add(request.city)
  }

  async removeUserData(city: string): Promise<void> {
    await this.userDataRepo.remove(city)
    this.changedCities.add(city)
  }
}

// 详情与参数写入用例共用快照，保持IPC、HTTP和Android进程内运行时的行为一致。
export const housingService = new HousingService()
