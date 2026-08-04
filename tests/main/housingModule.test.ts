import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UserHousingDataRepository, HousingWatchlistRepository } from '@main/repositories/housingRepository'
import { closeDatabase } from '@main/infrastructure/db/sqlite'
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
    userRepo.upsert({ cityCode: '北京', district: '朝阳区', pricePerSqm: 58000, rentPerSqm: 95 })
    const found = userRepo.findByCity('北京')
    expect(found?.cityCode).toBe('北京')
    expect(found?.pricePerSqm).toBe(58000)
    expect(found?.rentPerSqm).toBe(95)

    // 再次 upsert 覆盖（id 为 cityCode）
    userRepo.upsert({ cityCode: '北京', pricePerSqm: 60000 })
    const updated = userRepo.findByCity('北京')
    expect(updated?.pricePerSqm).toBe(60000)
  })

  it('removes user housing data', () => {
    userRepo.upsert({ cityCode: '上海', pricePerSqm: 60000 })
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
})
