/**
 * Integration test: verify Cih Index (中指研究院) housing data through SourceGateway pipeline.
 * Requires internet access. Skip in offline CI.
 */
import { describe, expect, it } from 'vitest'
import { CihIndexHousingDataSource } from '@main/adapters/cihIndex/cihIndexHousingDataSource'

const dataSource = new CihIndexHousingDataSource()

describe('Cih Index housing market data (integration via gateway)', () => {
  it('newHouse snapshot: 100 cities with sample prices and 12-month trend', async () => {
    const snapshot = await dataSource.getNewHouseSnapshot()

    expect(snapshot.type).toBe('newHouse')
    expect(snapshot.period).toMatch(/^\d{4}-\d{2}$/)
    expect(snapshot.unit).toBe('元/平方米')

    expect(snapshot.nationalAverage).toBeGreaterThan(1000)
    expect(snapshot.nationalAverage).toBeLessThan(100000)

    expect(snapshot.cities.length).toBeGreaterThanOrEqual(100)
    const beijing = snapshot.cities.find((item) => item.city === '北京')
    expect(beijing?.pricePerSqm).toBeGreaterThan(10000)

    expect(snapshot.trend.length).toBeGreaterThanOrEqual(12)
    const sorted = [...snapshot.trend].sort((a, b) => a.period.localeCompare(b.period))
    expect(snapshot.trend).toEqual(sorted)
    expect(snapshot.trend[snapshot.trend.length - 1].pricePerSqm).toBeGreaterThan(1000)
  })

  it('esfHouse snapshot: 100 cities second-hand sample prices', async () => {
    const snapshot = await dataSource.getEsfHouseSnapshot()

    expect(snapshot.type).toBe('esfHouse')
    expect(snapshot.cities.length).toBeGreaterThanOrEqual(100)
    const shanghai = snapshot.cities.find((item) => item.city === '上海')
    expect(shanghai?.pricePerSqm).toBeGreaterThan(10000)
  })

  it('rentIndex snapshot: 50 cities with rent in 元/㎡·月', async () => {
    const snapshot = await dataSource.getRentSnapshot()

    expect(snapshot.type).toBe('rentIndex')
    expect(snapshot.unit).toBe('元/平方米/月')
    expect(snapshot.nationalAverage).toBeGreaterThan(10)
    expect(snapshot.nationalAverage).toBeLessThan(200)

    expect(snapshot.cities.length).toBeGreaterThanOrEqual(50)
    const beijing = snapshot.cities.find((item) => item.city === '北京')
    expect(beijing?.pricePerSqm).toBeGreaterThan(30)
  })

  it('cities carry MoM/YoY rates', async () => {
    const snapshot = await dataSource.getNewHouseSnapshot()

    const withMoM = snapshot.cities.filter((item) => item.momPercent != null)
    const withYoY = snapshot.cities.filter((item) => item.yoyPercent != null)
    expect(withMoM.length).toBeGreaterThanOrEqual(90)
    expect(withYoY.length).toBeGreaterThanOrEqual(90)
  })

  it('rental yield derivable: Beijing rent / price ≈ 2%', async () => {
    const [priceSnap, rentSnap] = await Promise.all([
      dataSource.getNewHouseSnapshot(),
      dataSource.getRentSnapshot()
    ])

    const price = priceSnap.cities.find((item) => item.city === '北京')?.pricePerSqm
    const rent = rentSnap.cities.find((item) => item.city === '北京')?.pricePerSqm

    expect(price).toBeDefined()
    expect(rent).toBeDefined()

    const yieldPercent = ((rent as number) * 12) / (price as number) * 100
    expect(yieldPercent).toBeGreaterThan(0.5)
    expect(yieldPercent).toBeLessThan(10)
  })
})
