import { afterEach, describe, expect, it, vi } from 'vitest'
import { getArrayBuffer, getJson, getText, setHttpGetTransport } from '@main/infrastructure/http/httpClient'
import { createNativeHttpTransport } from '@main/infrastructure/http/nativeHttpTransport'

afterEach(() => setHttpGetTransport(undefined))

describe('Android 原生 HTTP', () => {
  it('插件自动解析 JSON 后仍履行文本接口契约', async () => {
    setHttpGetTransport(createNativeHttpTransport(vi.fn().mockResolvedValue({ status: 200, data: { value: 1 } })))
    await expect(getText('https://example.com/data')).resolves.toBe('{"value":1}')
  })
  it('通过原生请求传递超时和东方财富 Referer，返回 JSON DTO', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, data: { price: 12 }, headers: {}, url: '' })
    setHttpGetTransport(createNativeHttpTransport(request))
    await expect(getJson('https://push2.eastmoney.com/api/test', { timeout: 4321 })).resolves.toEqual({ price: 12 })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      responseType: 'json', readTimeout: 4321, connectTimeout: 4321,
      headers: expect.objectContaining({ Referer: 'https://quote.eastmoney.com/' })
    }))
  })

  it('HTTP 403 不会被当成成功数据', async () => {
    setHttpGetTransport(createNativeHttpTransport(vi.fn().mockResolvedValue({ status: 403, data: 'forbidden' })))
    await expect(getJson('https://example.com/data')).rejects.toThrow('HTTP 403')
  })

  it('原生 base64 二进制能按 GBK 解码中文行情', async () => {
    setHttpGetTransport(createNativeHttpTransport(vi.fn().mockResolvedValue({ status: 200, data: '1tDOxA==' })))
    const bytes = await getArrayBuffer('https://example.com/gbk')
    expect(new TextDecoder('gbk').decode(bytes)).toBe('中文')
  })
})
