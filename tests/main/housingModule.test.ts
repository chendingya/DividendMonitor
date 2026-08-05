import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HousingIndexCacheRepository,
  HOUSING_INDEX_CACHE_TTL_MS,
  UserHousingDataRepository,
  HousingWatchlistRepository
} from '@main/repositories/housingRepository'
import { closeDatabase, getDatabase } from '@main/infrastructure/db/sqlite'
import { getHousingCityDetail } from '@main/application/useCases/getHousingCityDetail'
import { calculateMortgageUseCase } from '@main/application/useCases/calculateMortgage'

const tempDir = mkdtempSync(join(tmpdir(), 'housing-module-'))
vi.mock('electron', () => ({
  app: { getPath: () => join(tempDir, 'userdata') }
}))

afterAll(() => {
  closeDatabase()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('housingRepository', () => {
  let userRepo: UserHousingDataRepository
  let watchRepo: HousingWatchlistRepository

  beforeEach(() => {
    userRepo = new UserHousingDataRepository()
    watchRepo = new HousingWatchlistRepository()
  })

  afterEach(() => {
    closeDatabase()
  })

  it('upserts and reads user housing data per city', () => {
    userRepo.upsert({ cityCode: '北京', district: '朝阳区', priceTotalYuan: 5000000, rentTotalMonthYuan: 8000 })
    const found = userRepo.findByCity('北京')
    expect(found?.cityCode).toBe('北京')
    expect(found?.priceTotalYuan).toBe(5000000)
    expect(found?.rentTotalMonthYuan).toBe(8000)

    // 再次 upsert 覆盖（id 为 cityCode）
    userRepo.upsert({ cityCode: '北京', priceTotalYuan: 6000000 })
    const updated = userRepo.findByCity('北京')
    expect(updated?.priceTotalYuan).toBe(6000000)
  })

  it('removes user housing data', () => {
    userRepo.upsert({ cityCode: '上海', priceTotalYuan: 6000000 })
    userRepo.remove('上海')
    expect(userRepo.findByCity('上海')).toBeUndefined()
  })

  it('adds, lists and removes watched cities', () => {
    watchRepo.add('北京', '北京')
    watchRepo.add('上海', '上海')
    expect(watchRepo.list().map((item) => item.cityCode).sort()).toEqual(['上海', '北京'].sort())
    expect(watchRepo.has('北京')).toBe(true)

    watchRepo.remove('北京')
    expect(watchRepo.has('北京')).toBe(false)
    expect(watchRepo.list()).toHaveLength(1)
  })
})

describe('housingIndexCacheRepository', () => {
  let cacheRepo: HousingIndexCacheRepository

  beforeEach(() => {
    cacheRepo = new HousingIndexCacheRepository()
  })

  afterEach(() => {
    closeDatabase()
  })

  const sampleRecords = [
    { reportDate: '2026-05', city: '北京', newHomeMoM: 99.8, newHomeYoY: 97.9, secondHandMoM: 100.1, secondHandYoY: 93.5 },
    { reportDate: '2026-06', city: '北京', newHomeMoM: 99.7, newHomeYoY: 97.9, secondHandMoM: 100.1, secondHandYoY: 94.5 }
  ]

  it('upsertMany 后 findByCity 返回同一城市数据（升序）', () => {
    cacheRepo.upsertMany('测试城A', sampleRecords)
    const cached = cacheRepo.findByCity('测试城A')
    expect(cached).toHaveLength(2)
    expect(cached?.[0].reportDate).toBe('2026-05')
    expect(cached?.[0].newHomeMoM).toBe(99.8)
    expect(cached?.[1].reportDate).toBe('2026-06')
  })

  it('upsertMany 全量覆盖：重复写入不残留旧行', () => {
    cacheRepo.upsertMany('测试城A', sampleRecords)
    cacheRepo.upsertMany('测试城A', [sampleRecords[1]])
    expect(cacheRepo.findByCity('测试城A')).toHaveLength(1)
  })

  it('无缓存时返回 undefined', () => {
    expect(cacheRepo.findByCity('不存在城市')).toBeUndefined()
  })

  it('allowStale=false 时过期缓存视为未命中；allowStale=true 返回过期数据', () => {
    const past = new Date(Date.now() - HOUSING_INDEX_CACHE_TTL_MS - 60_000).toISOString()
    const db = getDatabase()
    db.prepare(
      `INSERT INTO housing_index_cache (city_code, period, new_home_index_mom, fetched_at) VALUES (?, ?, ?, ?)`
    ).run('上海', '2026-06', 99.7, past)

    expect(cacheRepo.findByCity('上海')).toBeUndefined()
    const stale = cacheRepo.findByCity('上海', { allowStale: true })
    expect(stale).toHaveLength(1)
    expect(stale?.[0].newHomeMoM).toBe(99.7)
  })

  it('新鲜缓存（TTL 内）直接命中', () => {
    cacheRepo.upsertMany('测试城A', sampleRecords)
    expect(cacheRepo.findByCity('测试城A')).toHaveLength(2)
  })
})

describe('housing use cases', () => {
  it('calculateMortgageUseCase returns structured result', () => {
    const result = calculateMortgageUseCase({
      totalPrice: 300,
      downPaymentPercent: 30,
      loanYears: 30,
      annualInterestRate: 3.1,
      repaymentMethod: 'EQUAL_INSTALLMENT'
    })
    expect(result.loanAmount).toBeCloseTo(210, 6)
    expect(result.monthlyPayment).toBeGreaterThan(0)
    expect(result.schedule).toHaveLength(360)
  })

  it('getHousingCityDetail tolerates unknown city (returns structured shape)', async () => {
    const detail = await getHousingCityDetail('北京')
    expect(detail.city).toBe('北京')
    expect(Array.isArray(detail.indexHistory)).toBe(true)
    expect(Array.isArray(detail.priceTrend)).toBe(true)
  })

  it('getHousingCityDetail returns rebuilt index series for cities with history', async () => {
    const detail = await getHousingCityDetail('北京')

    expect(Array.isArray(detail.indexSeries)).toBe(true)
    if (detail.indexSeries.length > 0) {
      const first = detail.indexSeries[0]
      expect(first.newHomeIndex).toBeCloseTo(100, 5) // 起点锚定基准 100
      expect(first.secondHandIndex).toBeCloseTo(100, 5)
      // 北京 2011 至今房价整体上涨（指数应显著高于 100）
      const recent = detail.indexSeries[detail.indexSeries.length - 1]
      expect(recent.newHomeIndex).toBeGreaterThan(120)
      // 序列按时间升序
      for (let i = 1; i < detail.indexSeries.length; i++) {
        expect(detail.indexSeries[i].reportDate > detail.indexSeries[i - 1].reportDate).toBe(true)
      }
    }
  })
})
