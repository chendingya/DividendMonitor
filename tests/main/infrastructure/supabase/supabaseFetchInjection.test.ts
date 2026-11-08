import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSupabaseClient,
  resetSupabaseClient,
  setSessionStorage,
  setSupabaseFetch
} from '@main/infrastructure/supabase/supabaseClient'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userdata' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: () => 'decrypted-value'
  }
}))

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}

function okResponse(body: unknown, status = 400) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('Supabase 网络实现注入', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
    setSessionStorage(memoryStorage as never)
    resetSupabaseClient()
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    resetSupabaseClient()
  })

  it('认证请求走注入的网络实现，而不是全局 fetch', async () => {
    const calls: string[] = []
    const injected = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return okResponse({ error: 'invalid_grant', error_description: 'Invalid login credentials' })
    })

    setSupabaseFetch(injected as typeof fetch)
    const client = getSupabaseClient()
    expect(client).not.toBeNull()

    const result = await client!.auth.signInWithPassword({ email: 'probe@example.com', password: 'bad-password' })

    expect(injected).toHaveBeenCalledTimes(1)
    expect(calls[0]).toContain('/auth/v1/token')
    expect(result.error).not.toBeNull()
  })

  it('重新注入后创建新客户端并切换网络实现', async () => {
    const first = vi.fn(async () => okResponse({ error: 'first' }))
    setSupabaseFetch(first as typeof fetch)
    const firstClient = getSupabaseClient()
    await firstClient!.auth.signInWithPassword({ email: 'a@b.com', password: 'x' })
    expect(first).toHaveBeenCalledTimes(1)

    const second = vi.fn(async () => okResponse({ error: 'second' }))
    setSupabaseFetch(second as typeof fetch)
    const secondClient = getSupabaseClient()

    expect(secondClient).not.toBeNull()
    expect(secondClient).not.toBe(firstClient)
    await secondClient!.auth.signInWithPassword({ email: 'a@b.com', password: 'x' })
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1)
  })
})
