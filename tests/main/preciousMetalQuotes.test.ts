import { describe, expect, it } from 'vitest'
import { sinaPreciousMetalQuoteEndpoint } from '@main/infrastructure/dataSources/registry/sinaEndpoints'
import { eastmoneyPreciousMetalQuoteEndpoint } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'
import { CapabilityRouter } from '@main/infrastructure/dataSources/router/capabilityRouter'

describe('公开贵金属报价边界', () => {
  it('国际现货代码保留新浪要求的小写hf前缀', () => {
    expect(sinaPreciousMetalQuoteEndpoint.buildUrl({ code: 'hf_XAG' })).toContain('list=hf_XAG')
  })

  it('新浪空报价不当作成功缓存，允许切换已注册的后备源', () => {
    expect(() => sinaPreciousMetalQuoteEndpoint.mapResponse('var hq_str_SGE_AG9999="AG9999,白银9999,Ag99.99,--";', { code: 'AG9999' })).toThrow()
    expect(new CapabilityRouter().resolve('asset.quote', { assetType: 'SILVER', market: 'SGE', code: 'AG9999' }).fallbacks).toContain('eastmoney')
  })

  it('东方财富空报价也必须失败，不能成为有效的后备行情', () => {
    expect(() => eastmoneyPreciousMetalQuoteEndpoint.mapResponse({ data: {} }, { code: 'AG9999' })).toThrow()
  })

  it('真实新浪白银记录使用最新价字段，不能把今开盘12335当现价12150', () => {
    const result = sinaPreciousMetalQuoteEndpoint.mapResponse('var hq_str_SGE_AG9999="AG9999,白银9999,Ag99.99,12150.00,12244.00,12730.00,12335.00,12335.00,12150.00,12730.00,--,--,--,--,--,--,2026-10-30 15:29:47,-4.56%";', { code: 'AG9999' })
    expect(result.f43).toBe(12150)
  })
})
