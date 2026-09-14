import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * authService / syncStatusNotifier 去 electron 化后的广播器注入测试。
 * 纯 node 环境（无 electron）：默认广播器为 no-op；注入 fake 广播器后，
 * 通过真实路径（startAuthListener 的 onAuthStateChange 回调 / notifySyncStatus）驱动。
 */

type AuthStateCallback = (event: string, session: unknown) => void

const FAKE_SESSION = {
  access_token: 'token',
  refresh_token: 'refresh',
  user: { id: 'user-1', email: 'user@example.com' },
  expires_at: 4102444800
}

function createFakeSupabase(callbacks: { onAuthStateChange: AuthStateCallback[] }): unknown {
  return {
    auth: {
      onAuthStateChange: (cb: AuthStateCallback) => {
        callbacks.onAuthStateChange.push(cb)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      }
    }
  }
}

/** 每个 test 独立加载模块（vi.resetModules 保证模块级状态互不污染） */
async function loadModules(supabaseMock: unknown) {
  vi.resetModules()
  vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
    getSupabaseClient: () => supabaseMock,
    resetSupabaseClient: () => undefined
  }))
  const authService = await import('@main/infrastructure/supabase/authService')
  const syncStatusNotifier = await import('@main/infrastructure/supabase/syncStatusNotifier')
  return { authService, syncStatusNotifier }
}

describe('authState broadcaster 注入', () => {
  const callbacks: AuthStateCallback[] = []

  beforeEach(() => {
    callbacks.length = 0
  })

  afterEach(() => {
    vi.doUnmock('@main/infrastructure/supabase/supabaseClient')
    vi.resetModules()
  })

  it('注入后 startAuthListener 的 onAuthStateChange 回调会把 session 映射并广播给注入方', async () => {
    const { authService } = await loadModules(createFakeSupabase({ onAuthStateChange: callbacks }))
    const received: Array<unknown> = []
    authService.setAuthStateBroadcaster((session) => {
      received.push(session)
    })

    authService.startAuthListener()
    expect(callbacks).toHaveLength(1)

    callbacks[0]!('SIGNED_IN', FAKE_SESSION)
    expect(received).toEqual([
      { user: { id: 'user-1', email: 'user@example.com' }, expiresAt: 4102444800 }
    ])

    callbacks[0]!('SIGNED_OUT', null)
    expect(received[1]).toBeNull()
  })

  it('未注入时走同一真实路径不抛错（默认 no-op）', async () => {
    const { authService } = await loadModules(createFakeSupabase({ onAuthStateChange: callbacks }))

    expect(() => authService.startAuthListener()).not.toThrow()
    expect(() => {
      callbacks[0]!('SIGNED_IN', FAKE_SESSION)
      callbacks[0]!('SIGNED_OUT', null)
    }).not.toThrow()
  })
})

describe('syncStatus broadcaster 注入', () => {
  afterEach(() => {
    vi.doUnmock('@main/infrastructure/supabase/supabaseClient')
    vi.resetModules()
  })

  it('注入后 notifySyncStatus 把带时间戳的事件广播给注入方，且去重不重复广播', async () => {
    const { syncStatusNotifier } = await loadModules(null)
    const received: Array<{ status: string; message?: string; timestamp: number }> = []
    syncStatusNotifier.setSyncStatusBroadcaster((event) => {
      received.push(event)
    })

    syncStatusNotifier.notifySyncStatus({ status: 'error', message: '同步失败' })
    expect(received).toEqual([{ status: 'error', message: '同步失败', timestamp: expect.any(Number) }])

    // 相同状态去重：不重复广播
    syncStatusNotifier.notifySyncStatus({ status: 'error', message: '同步失败' })
    expect(received).toHaveLength(1)

    // 状态变化后再次广播
    syncStatusNotifier.notifySyncStatus({ status: 'synced' })
    expect(received).toHaveLength(2)
    expect(received[1]).toMatchObject({ status: 'synced' })
  })

  it('未注入时 notifySyncStatus 不抛错，getLastSyncStatus 仍返回最新状态', async () => {
    const { syncStatusNotifier } = await loadModules(null)

    // 未触发过通知时返回默认值
    expect(syncStatusNotifier.getLastSyncStatus()).toEqual({ status: 'synced' })

    expect(() => syncStatusNotifier.notifySyncStatus({ status: 'offline-fallback', message: '降级' })).not.toThrow()
    expect(syncStatusNotifier.getLastSyncStatus()).toEqual({ status: 'offline-fallback', message: '降级' })
  })
})
