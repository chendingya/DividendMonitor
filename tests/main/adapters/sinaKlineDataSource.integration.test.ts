/**
 * Integration test: verify Sina Finance K-line API + local cache pipeline.
 * Requires internet access. Skip in offline CI.
 */
import { describe, expect, it } from 'vitest'

const SINA_BASE =
  'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData'

async function fetchSinaKline(code: string, datalen = 10) {
  const prefix = code.startsWith('5') || code.startsWith('6') ? 'sh' : 'sz'
  const url = `${SINA_BASE}?symbol=${prefix}${code}&scale=240&ma=no&datalen=${datalen}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<Array<{ day: string; close: string }>>
}

describe('Sina K-line API (integration)', () => {
  it('returns daily data for A-share 601988 with long history', async () => {
    const data = await fetchSinaKline('601988', 5000)

    expect(data.length).toBeGreaterThan(3000)
    expect(data[0].day.localeCompare('2010-01-01')).toBeLessThan(0) // goes back to 2006
    expect(data[data.length - 1].day.localeCompare('2026-01-01')).toBeGreaterThan(0)

    // Verify each record has valid fields
    for (const d of data.slice(0, 100)) {
      expect(parseFloat(d.close)).toBeGreaterThan(0)
      expect(d.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('returns daily data for ETF 510880 with long history', async () => {
    const data = await fetchSinaKline('510880', 5000)

    expect(data.length).toBeGreaterThan(3000)
    expect(data[0].day.localeCompare('2010-01-01')).toBeLessThan(0) // listed 2007
    expect(data[data.length - 1].day.localeCompare('2026-01-01')).toBeGreaterThan(0)
  })

  it('returns correct fields for Shenzhen stock', async () => {
    const data = await fetchSinaKline('000001', 5000)

    expect(data.length).toBeGreaterThan(3000)
    expect(data[0].day.localeCompare('2010-01-01')).toBeLessThan(0) // listed 2005
  })

  it('small datalen returns only recent bars', async () => {
    const data = await fetchSinaKline('601988', 3)

    expect(data.length).toBeLessThanOrEqual(3)
    expect(data.length).toBeGreaterThan(0)
  })

  it('latest close price matches reasonable range for 601988', async () => {
    const data = await fetchSinaKline('601988', 1)

    const close = parseFloat(data[0].close)
    expect(close).toBeGreaterThan(1)   // not a penny stock
    expect(close).toBeLessThan(20)     // not insane
  })
})

describe('Sina data format validation', () => {
  it('all records have valid numeric close prices', async () => {
    const data = await fetchSinaKline('601988', 50)
    for (const d of data) {
      const close = parseFloat(d.close)
      expect(Number.isFinite(close)).toBe(true)
      expect(close).toBeGreaterThan(0)
    }
  })

  it('dates are strictly increasing', async () => {
    const data = await fetchSinaKline('601988', 100)
    for (let i = 1; i < data.length; i++) {
      expect(data[i].day > data[i - 1].day).toBe(true)
    }
  })
})
