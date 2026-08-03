/**
 * Integration test: verify Eastmoney 70-city housing price index API + adapter pipeline.
 * Requires internet access. Skip in offline CI.
 */
import { describe, expect, it } from 'vitest'
import { EastmoneyHousingDataSource } from '@main/adapters/eastmoney/eastmoneyHousingDataSource'
import { eastmoneyHousingPriceIndexEndpoint } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'

describe('Eastmoney housing price index endpoint (unit)', () => {
  it('builds URL with period filter', () => {
    const url = eastmoneyHousingPriceIndexEndpoint.buildUrl({ period: '2026-06' })
    expect(url).toContain('reportName=RPT_ECONOMY_HOUSE_PRICE')
    expect(url).toContain(encodeURIComponent("(REPORT_DATE='2026-06-01 00:00:00')"))
  })

  it('builds URL with city filter', () => {
    const url = eastmoneyHousingPriceIndexEndpoint.buildUrl({ city: '北京' })
    expect(url).toContain(encodeURIComponent('(CITY="北京")'))
  })

  it('maps raw response to records', () => {
    const output = eastmoneyHousingPriceIndexEndpoint.mapResponse(
      {
        result: {
          count: 2,
          data: [
            {
              REPORT_DATE: '2026-06-01 00:00:00',
              CITY: '北京',
              FIRST_COMHOUSE_SEQUENTIAL: 99.7,
              FIRST_COMHOUSE_SAME: 97.9,
              SECOND_HOUSE_SEQUENTIAL: 100.1,
              SECOND_HOUSE_SAME: 94.5
            },
            {
              REPORT_DATE: '2026-06-01 00:00:00',
              CITY: '上海',
              FIRST_COMHOUSE_SEQUENTIAL: 100.3,
              FIRST_COMHOUSE_SAME: 103.1,
              SECOND_HOUSE_SEQUENTIAL: 100.4,
              SECOND_HOUSE_SAME: 96.8
            }
          ]
        }
      },
      { period: '2026-06' }
    )

    expect(output.count).toBe(2)
    expect(output.records).toHaveLength(2)
    expect(output.records[0]).toEqual({
      reportDate: '2026-06',
      city: '北京',
      newHomeMoM: 99.7,
      newHomeYoY: 97.9,
      secondHandMoM: 100.1,
      secondHandYoY: 94.5
    })
  })

  it('drops records without city and null values', () => {
    const output = eastmoneyHousingPriceIndexEndpoint.mapResponse(
      {
        result: {
          data: [
            { REPORT_DATE: '2026-06-01 00:00:00', CITY: '北京', FIRST_COMHOUSE_SEQUENTIAL: null },
            { REPORT_DATE: '2026-06-01 00:00:00' }
          ]
        }
      },
      {}
    )
    expect(output.records).toHaveLength(1)
    expect(output.records[0].newHomeMoM).toBeUndefined()
  })
})

describe('Eastmoney housing price index API (integration)', () => {
  const dataSource = new EastmoneyHousingDataSource()

  it('returns 70 cities for the latest month snapshot', async () => {
    const snapshot = await dataSource.getLatestSnapshot()

    expect(snapshot.length).toBeGreaterThanOrEqual(70)
    for (const record of snapshot) {
      expect(record.reportDate).toMatch(/^\d{4}-\d{2}$/)
      expect(record.city.length).toBeGreaterThan(0)
    }

    const latest = snapshot[0]?.reportDate
    expect(latest.localeCompare('2024-01')).toBeGreaterThan(0)
  })

  it('returns full history for Beijing (2011-01 to now, ~186 months)', async () => {
    const history = await dataSource.getCityHistory('北京')

    expect(history.length).toBeGreaterThan(170)
    expect(history[0].reportDate).toBe('2026-06')

    const oldest = history[history.length - 1]
    expect(oldest.reportDate.localeCompare('2011-06')).toBeLessThanOrEqual(0)

    for (const record of history) {
      if (record.newHomeYoY != null) {
        expect(record.newHomeYoY).toBeGreaterThan(50)
        expect(record.newHomeYoY).toBeLessThan(150)
      }
    }
  })

  it('returns exactly one month for a filtered period', async () => {
    const snapshot = await dataSource.getLatestSnapshot('2026-05')

    expect(snapshot.length).toBeGreaterThanOrEqual(70)
    for (const record of snapshot) {
      expect(record.reportDate).toBe('2026-05')
    }
  })

  it('second-hand and new-home indices are both populated', async () => {
    const snapshot = await dataSource.getLatestSnapshot()

    const withSecondHand = snapshot.filter((r) => r.secondHandYoY != null)
    const withNewHome = snapshot.filter((r) => r.newHomeYoY != null)

    expect(withSecondHand.length).toBeGreaterThanOrEqual(60)
    expect(withNewHome.length).toBeGreaterThanOrEqual(60)
  })
})
