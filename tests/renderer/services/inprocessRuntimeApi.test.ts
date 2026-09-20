import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inprocessRuntimeApi } from '@renderer/services/inprocessRuntimeApi'
import { stopAuthListener } from '@main/infrastructure/supabase/authService'

/**
 * Android inprocess 运行时关键约定的单元测试：
 * - 约定 6：fx.getUsdCnyRate 复制 fxRoutes 兜底语义（用例抛错 → 7.2）
 * - 约定 5：backup 直接抛 '备份恢复仅桌面版支持'
 * - 约定 4：security.getLocalNonce 固定 'inprocess'
 * - 约定 7：auth.onAuthStateChange 走 startAuthListener + 进程内订阅
 */

const { getUsdCnyRateMock, supabaseState } = vi.hoisted(() => ({
  getUsdCnyRateMock: vi.fn(),
  supabaseState: { callbacks: [] as Array<(event: string, session: unknown) => void> }
}))

vi.mock('@main/application/useCases/getFxRateUseCase', () => ({
  getUsdCnyRate: getUsdCnyRateMock
}))

vi.mock('@main/infrastructure/supabase/supabaseClient', () => ({
  getSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        supabaseState.callbacks.push(cb)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      }
    }
  }),
  resetSupabaseClient: () => undefined
}))

const FAKE_SESSION = {
  access_token: 'token',
  refresh_token: 'refresh',
  user: { id: 'user-1', email: 'user@example.com' },
  expires_at: 4102444800
}

describe('inprocessRuntimeApi.fx', () => {
  beforeEach(() => {
    getUsdCnyRateMock.mockReset()
  })

  it('用例成功时透传汇率', async () => {
    getUsdCnyRateMock.mockResolvedValueOnce(6.95)
    await expect(inprocessRuntimeApi.fx.getUsdCnyRate()).resolves.toBe(6.95)
  })

  it('用例抛错时兜底 7.2（与 fxRoutes 语义一致）', async () => {
    getUsdCnyRateMock.mockRejectedValueOnce(new Error('网络不可达'))
    await expect(inprocessRuntimeApi.fx.getUsdCnyRate()).resolves.toBe(7.2)
  })
})

describe('inprocessRuntimeApi.backup / security', () => {
  it('backup 按 Promise 合约报告桌面版限制错误', async () => {
    await expect(inprocessRuntimeApi.backup.createBackup()).rejects.toThrow('备份恢复仅桌面版支持')
    await expect(inprocessRuntimeApi.backup.restoreBackup()).rejects.toThrow('备份恢复仅桌面版支持')
  })

  it('security.getLocalNonce 返回固定 inprocess（约定 4）', async () => {
    await expect(inprocessRuntimeApi.security.getLocalNonce()).resolves.toBe('inprocess')
  })
})

describe('inprocessRuntimeApi.auth.onAuthStateChange', () => {
  beforeEach(() => {
    // 重置 authService 的监听状态，保证每个 test 独立注册 onAuthStateChange 回调
    stopAuthListener()
    supabaseState.callbacks.length = 0
  })

  it('注册进程内订阅并启动 Supabase 监听，广播映射后的 session；取消订阅后不再收到', async () => {
    const received: unknown[] = []
    const unsubscribe = inprocessRuntimeApi.auth.onAuthStateChange((session) => {
      received.push(session)
    })

    // startAuthListener 已通过 fake supabase client 注册回调
    expect(supabaseState.callbacks).toHaveLength(1)

    supabaseState.callbacks[0]!('SIGNED_IN', FAKE_SESSION)
    expect(received).toEqual([
      { user: { id: 'user-1', email: 'user@example.com' }, expiresAt: 4102444800 }
    ])

    unsubscribe()
    supabaseState.callbacks[0]!('SIGNED_OUT', null)
    expect(received).toHaveLength(1)
  })

  it('重复注册不重复启动监听（authService 内部去重），订阅各自独立', async () => {
    const first: unknown[] = []
    const second: unknown[] = []
    const unsubscribeFirst = inprocessRuntimeApi.auth.onAuthStateChange((s) => first.push(s))
    const unsubscribeSecond = inprocessRuntimeApi.auth.onAuthStateChange((s) => second.push(s))

    expect(supabaseState.callbacks).toHaveLength(1)

    supabaseState.callbacks[0]!('SIGNED_IN', FAKE_SESSION)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)

    unsubscribeFirst()
    supabaseState.callbacks[0]!('SIGNED_OUT', null)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(2)
    expect(second[1]).toBeNull()

    unsubscribeSecond()
  })
})
