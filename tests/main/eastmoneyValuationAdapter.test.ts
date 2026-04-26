import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getJsonMock } = vi.hoisted(() => ({
  getJsonMock: vi.fn()
}))

vi.mock('@main/infrastructure/http/httpClient', () => ({
  getJson: getJsonMock
}))

import { EastmoneyValuationAdapter } from '@main/adapters/eastmoney/eastmoneyValuationAdapter'

describe('EastmoneyValuationAdapter', () => {
  beforeEach(() => {
    getJsonMock.mockReset()
  })

  it('fetches all valuation trend pages instead of only the first page', async () => {
    getJsonMock
      .mockResolvedValueOnce({
        result: {
          pages: 3,
          data: [{ TRADE_DATE: '2026-04-01', INDICATOR_VALUE: 10 }]
        }
      })
      .mockResolvedValueOnce({
        result: {
          pages: 3,
          data: [{ TRADE_DATE: '2020-04-01', INDICATOR_VALUE: 20 }]
        }
      })
      .mockResolvedValueOnce({
        result: {
          pages: 3,
          data: [{ TRADE_DATE: '2010-04-01', INDICATOR_VALUE: 30 }]
        }
      })

    const adapter = new EastmoneyValuationAdapter()
    const result = await adapter.getTrend('600519', 1)

    expect(getJsonMock).toHaveBeenCalledTimes(3)
    expect(result).toEqual([
      { date: '2026-04-01', value: 10 },
      { date: '2020-04-01', value: 20 },
      { date: '2010-04-01', value: 30 }
    ])
  })
})
