import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installElectronSqliteProvider } from '@main/infrastructure/db/electronSqliteProvider'
import { closeDatabase, getDatabase } from '@main/infrastructure/db/sqlite'
import { CihIndexHousingDataSource } from '@main/adapters/cihIndex/cihIndexHousingDataSource'
import { EastmoneyHousingDataSource } from '@main/adapters/eastmoney/eastmoneyHousingDataSource'
import { updateHousingUserData } from '@main/application/useCases/updateHousingUserData'
import { removeHousingUserData } from '@main/application/useCases/removeHousingUserData'
import { getHousingCityDetail } from '@main/application/useCases/getHousingCityDetail'
import { listHousingCities } from '@main/application/useCases/listHousingCities'
import { watchHousingCity } from '@main/application/useCases/toggleHousingWatchlist'
import { getCrossAssetComparison } from '@main/application/useCases/getCrossAssetComparison'

const tempDir = mkdtempSync(join(tmpdir(), 'housing-user-flow-'))
vi.mock('electron', () => ({ app: { getPath: () => join(tempDir, 'userdata') } }))

beforeEach(async () => {
  await installElectronSqliteProvider()
  await getDatabase().exec('DELETE FROM user_housing_data; DELETE FROM housing_watchlist;')
  const common = { period: '2026-09', unit: '元/㎡', trend: [] }
  vi.spyOn(CihIndexHousingDataSource.prototype, 'getNewHouseSnapshot').mockResolvedValue({
    ...common, type: 'newHouse', cities: [{ city: '北京', pricePerSqm: 50000 }]
  })
  vi.spyOn(CihIndexHousingDataSource.prototype, 'getEsfHouseSnapshot').mockResolvedValue({
    ...common, type: 'esfHouse', cities: [{ city: '北京', pricePerSqm: 45000 }]
  })
  vi.spyOn(CihIndexHousingDataSource.prototype, 'getRentSnapshot').mockResolvedValue({
    ...common, type: 'rentIndex', cities: [{ city: '北京', pricePerSqm: 100 }]
  })
  vi.spyOn(EastmoneyHousingDataSource.prototype, 'getCityHistory').mockResolvedValue([])
})

afterEach(async () => {
  vi.restoreAllMocks()
  await closeDatabase()
})

afterAll(() => rmSync(tempDir, { recursive: true, force: true }))

describe('房产参数真实 SQLite 保存、关联和恢复链路', () => {
  it('保存后详情、城市列表和跨资产使用同一自定义收益率，均价仍保持市场单位', async () => {
    await updateHousingUserData({ city: '北京', priceTotalYuan: 5000000, rentTotalMonthYuan: 8000 })
    await watchHousingCity('北京')
    const detail = await getHousingCityDetail('北京')
    const [city] = await listHousingCities()
    expect(detail.rentalYieldPercent).toBeCloseTo(1.92)
    expect(city.rentalYieldPercent).toBeCloseTo(1.92)
    expect(city).toMatchObject({ pricePerSqm: 50000, rentPerSqm: 100, yieldSource: 'custom' })
    const comparison = await getCrossAssetComparison()
    expect(comparison.points.find((point) => point.kind === 'housing')).toMatchObject({
      yieldPercent: 1.92, yieldLabel: '租金收益率（自定义）'
    })
  })

  it.each([
    { priceTotalYuan: 5000000 },
    { rentTotalMonthYuan: 8000 }
  ])('只填一项总金额时不与市场每平方米数据混算：%j', async (amounts) => {
    await updateHousingUserData({ city: '北京', ...amounts })
    const detail = await getHousingCityDetail('北京')
    const [city] = await listHousingCities()
    for (const result of [detail, city]) {
      expect(result.rentalYieldPercent).toBeUndefined()
      expect(result.priceToRentRatio).toBeUndefined()
      expect(result.yieldSource).toBe('custom')
    }
  })

  it('只更新备注时继续使用自动市场口径', async () => {
    await updateHousingUserData({ city: '北京', note: '考察望京小区' })
    const detail = await getHousingCityDetail('北京')
    expect(detail.rentalYieldPercent).toBeCloseTo(2.4)
    expect(detail.yieldSource).toBe('market')
  })

  it('重开数据库保留编辑后的金额与小区，清除后恢复自动收益率', async () => {
    await updateHousingUserData({ city: '北京', district: '朝阳区', community: '望京', priceTotalYuan: 5000000, rentTotalMonthYuan: 8000 })
    await updateHousingUserData({ city: '北京', district: '朝阳区', community: '望京', priceTotalYuan: 5000000, rentTotalMonthYuan: 10000 })
    await closeDatabase()
    await installElectronSqliteProvider()
    const edited = await getHousingCityDetail('北京')
    expect(edited.rentalYieldPercent).toBeCloseTo(2.4)
    expect(edited.userData).toMatchObject({ community: '望京', rentTotalMonthYuan: 10000 })
    await removeHousingUserData('北京')
    expect((await getHousingCityDetail('北京')).userData).toBeUndefined()
    const [city] = await listHousingCities()
    expect(city).toMatchObject({ rentalYieldPercent: 2.4, yieldSource: 'market' })
  })

  it('已加载详情的保存与清除复用市场快照，仅回读本地自定义数据并重算', async () => {
    const original = await getHousingCityDetail('北京')
    vi.mocked(CihIndexHousingDataSource.prototype.getNewHouseSnapshot).mockRejectedValue(new Error('外部市场接口离线'))
    vi.mocked(CihIndexHousingDataSource.prototype.getEsfHouseSnapshot).mockRejectedValue(new Error('外部市场接口离线'))
    vi.mocked(CihIndexHousingDataSource.prototype.getRentSnapshot).mockRejectedValue(new Error('外部市场接口离线'))
    vi.mocked(EastmoneyHousingDataSource.prototype.getCityHistory).mockRejectedValue(new Error('指数接口离线'))

    await updateHousingUserData({ city: '北京', priceTotalYuan: 5000000, rentTotalMonthYuan: 8000 })
    const saved = await getHousingCityDetail('北京')
    expect(saved).toMatchObject({ rentalYieldPercent: 1.92, pricePerSqm: 50000, rentPerSqm: 100, yieldSource: 'custom' })
    expect(saved.userData?.rentTotalMonthYuan).toBe(8000)
    expect(saved.period).toBe(original.period)

    await updateHousingUserData({ city: '北京', priceTotalYuan: 5000000, rentTotalMonthYuan: 10000 })
    expect((await getHousingCityDetail('北京')).rentalYieldPercent).toBeCloseTo(2.4)
    await removeHousingUserData('北京')
    const removed = await getHousingCityDetail('北京')
    expect(removed.userData).toBeUndefined()
    expect(removed).toMatchObject({ rentalYieldPercent: 2.4, yieldSource: 'market', pricePerSqm: 50000 })
  })
})
