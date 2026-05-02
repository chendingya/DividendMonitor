import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn()
}))

vi.mock('@main/infrastructure/dataSources/gateway/sourceGateway', () => ({
  getDefaultSourceGateway: () => ({
    request: requestMock
  })
}))

import { fetchSinaDailyKline } from '@main/adapters/sina/sinaKlineDataSource'

describe('fetchSinaDailyKline', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('loads kline data through SourceGateway', async () => {
    requestMock.mockResolvedValueOnce({
      data: [{ date: '2024-01-02', close: 10.5 }],
      provider: 'sina',
      endpointId: 'sina.kline.daily',
      isFallback: false,
      isStale: false,
      fetchedAt: new Date().toISOString()
    })

    const result = await fetchSinaDailyKline('601988', 30)

    expect(requestMock).toHaveBeenCalledWith({
      capability: 'asset.kline',
      providerHint: 'sina',
      input: {
        code: '601988',
        datalen: 30
      }
    })
    expect(result).toEqual([{ date: '2024-01-02', close: 10.5 }])
  })
})
