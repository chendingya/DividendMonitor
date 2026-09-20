import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  clients: [] as Array<{ emit: (session: unknown) => void }>,
  signOutError: null as null | { message: string }
}))

const session = { user: { id: 'test-user', email: 'test@example.com' }, expires_at: 4102444800 }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    let callback: ((event: string, value: unknown) => void) | undefined
    const emit = (value: unknown) => callback?.('TOKEN_REFRESHED', value)
    fake.clients.push({ emit })
    return { auth: {
      onAuthStateChange: (listener: typeof callback) => {
        callback = listener
        return { data: { subscription: { unsubscribe: () => { callback = undefined } } } }
      },
      signInWithPassword: async () => { emit(session); return { data: { session }, error: null } },
      signOut: async () => { if (!fake.signOutError) emit(null); return { error: fake.signOutError } }
    } }
  }
}))

beforeEach(() => {
  vi.resetModules()
  fake.clients.length = 0
  fake.signOutError = null
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('SUPABASE_ANON_KEY', 'public-test-key')
})
afterEach(() => vi.unstubAllEnvs())

describe('登录生命周期', () => {
  it('退出失败向 UI 报错，保留当前会话和在线模式', async () => {
    const { authService, startAuthListener } = await import('@main/infrastructure/supabase/authService')
    const { getRuntimeMode } = await import('@main/infrastructure/supabase/runtimeMode')
    startAuthListener()
    await authService.login('test@example.com', 'test-password')
    fake.signOutError = { message: 'network unavailable' }
    await expect(authService.logout()).rejects.toThrow('退出登录失败')
    expect((await authService.getSession())?.user.id).toBe('test-user')
    expect(getRuntimeMode()).toBe('online')
  })

  it('退出后再次登录仍接收 token refresh 事件', async () => {
    const { authService, startAuthListener, subscribeAuthState } = await import('@main/infrastructure/supabase/authService')
    const listener = vi.fn()
    subscribeAuthState(listener)
    startAuthListener()
    await authService.login('test@example.com', 'test-password')
    await authService.logout()
    await authService.login('test@example.com', 'test-password')
    const refreshed = { ...session, expires_at: 4102444900 }
    fake.clients.at(-1)!.emit(refreshed)
    expect(listener).toHaveBeenLastCalledWith({ user: session.user, expiresAt: refreshed.expires_at })
  })
})
