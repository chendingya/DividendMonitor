import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn()
}))

vi.mock('@main/infrastructure/dataSources/gateway/sourceGateway', () => ({
  getDefaultSourceGateway: () => ({
    request: requestMock
  })
}))

import { EastmoneyValuationAdapter } from '@main/adapters/eastmoney/eastmoneyValuationAdapter'

describe('EastmoneyValuationAdapter', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('fetches valuation percentile snapshot', async () => {
    requestMock.mockResolvedValueOnce({
      data: {
        currentValue: 15.5,
        currentPercentile: 45.2,
        status: '合理'
      }
    })

    const adapter = new EastmoneyValuationAdapter()
    const result = await adapter.getSnapshot('600519', 1)

    expect(requestMock).toHaveBeenCalledWith({
      capability: 'valuation.percentile',
      input: { code: '600519', indicatorType: 1 }
    })
    expect(result).toEqual({
      currentValue: 15.5,
      currentPercentile: 45.2,
      status: '合理'
    })
  })

  it('fetches valuation trend data', async () => {
    requestMock.mockResolvedValueOnce({
      data: [
        { date: '2026-04-01', value: 10 },
        { date: '2020-04-01', value: 20 },
        { date: '2010-04-01', value: 30 }
      ]
    })

    const adapter = new EastmoneyValuationAdapter()
    const result = await adapter.getTrend('600519', 1)

    expect(requestMock).toHaveBeenCalledWith({
      capability: 'valuation.trend',
      input: { code: '600519', indicatorType: 1 }
    })
    expect(result).toEqual([
      { date: '2026-04-01', value: 10 },
      { date: '2020-04-01', value: 20 },
      { date: '2010-04-01', value: 30 }
    ])
  })

  it('returns undefined when snapshot fails', async () => {
    requestMock.mockRejectedValueOnce(new Error('Network error'))

    const adapter = new EastmoneyValuationAdapter()
    const result = await adapter.getSnapshot('600519', 1)

    expect(result).toBeUndefined()
  })

  it('returns empty array when trend fails', async () => {
    requestMock.mockRejectedValueOnce(new Error('Network error'))

    const adapter = new EastmoneyValuationAdapter()
    const result = await adapter.getTrend('600519', 1)

    expect(result).toEqual([])
  })
})
