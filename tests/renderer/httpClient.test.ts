import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '@renderer/services/httpClient'

describe('requestJson API 基址', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('未配置 VITE_API_BASE_URL 时使用相对路径（同源代理）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('/api/sync/status')

    expect(fetchMock).toHaveBeenCalledWith('/api/sync/status', expect.anything())
  })

  it('配置 VITE_API_BASE_URL 时拼接绝对地址', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('/api/sync/status')

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/sync/status', expect.anything())
  })

  it('VITE_API_BASE_URL 尾部斜杠被去除', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('/api/sync/status')

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/sync/status', expect.anything())
  })
})
