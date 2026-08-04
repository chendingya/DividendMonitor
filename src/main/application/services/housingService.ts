import type {
  HousingCityDetailDto,
  HousingCitySummaryDto,
  HousingIndexPointDto,
  HousingPriceTrendPointDto,
  UserHousingDataUpsertDto
} from '@shared/contracts/api'
import { EastmoneyHousingDataSource } from '@main/adapters/eastmoney/eastmoneyHousingDataSource'
import { CihIndexHousingDataSource } from '@main/adapters/cihIndex/cihIndexHousingDataSource'
import { UserHousingDataRepository, HousingWatchlistRepository } from '@main/repositories/housingRepository'
import { calculateHousingDerivedMetrics } from '@main/domain/services/housingCalculationService'
import type { HousingIndexRecord } from '@main/domain/entities/Housing'

export class HousingService {
  private readonly eastmoney = new EastmoneyHousingDataSource()
  private readonly cih = new CihIndexHousingDataSource()
  private readonly userDataRepo = new UserHousingDataRepository()
  private readonly watchlistRepo = new HousingWatchlistRepository()

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

    // 用户手动数据优先（区/小区级精细化）
    const effectivePrice = userData?.pricePerSqm ?? newHome?.pricePerSqm ?? esf?.pricePerSqm
    const effectiveRent = userData?.rentPerSqm ?? rentInfo?.pricePerSqm
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
      priceTrend,
      rentTrend,
      userData: userData
        ? {
            district: userData.district,
            community: userData.community,
            pricePerSqm: userData.pricePerSqm,
            rentPerSqm: userData.rentPerSqm,
            note: userData.note,
            updatedAt: userData.updatedAt
          }
        : undefined
    }
  }

  private async fetchIndexHistory(city: string): Promise<HousingIndexPointDto[]> {
    try {
      const records: HousingIndexRecord[] = await this.eastmoney.getCityHistory(city)
      return records
        .slice()
        .reverse()
        .map((record) => ({
          reportDate: record.reportDate,
          newHomeMoM: record.newHomeMoM,
          newHomeYoY: record.newHomeYoY,
          secondHandMoM: record.secondHandMoM,
          secondHandYoY: record.secondHandYoY
        }))
    } catch {
      return []
    }
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
      pricePerSqm: request.pricePerSqm,
      rentPerSqm: request.rentPerSqm,
      note: request.note
    })
  }
}
