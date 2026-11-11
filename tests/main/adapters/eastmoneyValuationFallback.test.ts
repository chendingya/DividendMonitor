import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn()
}))

vi.mock('@main/infrastructure/dataSources/gateway/sourceGateway', () => ({
  getDefaultSourceGateway: () => ({
    request: requestMock
  })
}))

import { resolveValuationSnapshot } from '@main/adapters/eastmoney/eastmoneyAShareDataSource'

function envelope<T>(data: T) {
  return {
    data,
    provider: 'eastmoney',
    endpointId: 'test',
    isFallback: false,
    isStale: false,
    fetchedAt: new Date().toISOString()
  }
}

describe('resolveValuationSnapshot industry fallback', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('falls back to F10 profile when snapshot succeeds without industry', async () => {
    requestMock
      .mockResolvedValueOnce(envelope({ roe: 7 }))
      .mockResolvedValueOnce(envelope({ industry: '银行' }))

    const result = await resolveValuationSnapshot('601398')

    expect(result).toEqual({ roe: 7, industry: '银行' })
    expect(requestMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ capability: 'valuation.snapshot' }))
    expect(requestMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ capability: 'asset.profile' }))
  })

  it('uses F10 profile when snapshot request fails', async () => {
    requestMock
      .mockRejectedValueOnce(new Error('snapshot failed'))
      .mockResolvedValueOnce(envelope({ industry: '白酒' }))

    const result = await resolveValuationSnapshot('600519')

    expect(result).toEqual({ roe: undefined, industry: '白酒' })
    expect(requestMock).toHaveBeenCalledTimes(2)
  })

  it('does not call profile when snapshot already returns industry', async () => {
    requestMock.mockResolvedValueOnce(envelope({ roe: 12, industry: '煤炭' }))

    const result = await resolveValuationSnapshot('601088')

    expect(result).toEqual({ roe: 12, industry: '煤炭' })
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('returns empty object when both endpoints fail', async () => {
    requestMock.mockRejectedValueOnce(new Error('snapshot failed')).mockRejectedValueOnce(new Error('profile failed'))

    await expect(resolveValuationSnapshot('600036')).resolves.toEqual({
      roe: undefined,
      industry: undefined
    })
  })
})
