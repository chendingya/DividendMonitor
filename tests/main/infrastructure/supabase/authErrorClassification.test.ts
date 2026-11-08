import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authService, classifyAuthError } from '@main/infrastructure/supabase/authService'

const state = vi.hoisted(() => ({
  available: true,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn()
}))

vi.mock('@main/infrastructure/supabase/supabaseClient', () => ({
  getSupabaseClient: () =>
    state.available
      ? {
          auth: {
            signInWithPassword: state.signIn,
            signUp: state.signUp,
            signOut: state.signOut,
            updateUser: state.updateUser
          }
        }
      : null
}))

vi.mock('@main/infrastructure/supabase/runtimeMode', () => ({
  setRuntimeMode: () => undefined
}))

async function loginFailure(error: unknown): Promise<string> {
  state.signIn.mockResolvedValueOnce({ data: { session: null }, error })
  try {
    await authService.login('user@example.com', 'secret123')
    throw new Error('预期登录失败，但调用成功')
  } catch (err) {
    return (err as Error).message
  }
}

describe('登录错误分类', () => {
  beforeEach(() => {
    state.available = true
    state.signIn.mockReset()
  })

  it('网络不可达（fetch failed）归类为 NETWORK', async () => {
    const message = await loginFailure({ message: 'fetch failed', status: 0 })
    expect(message).toContain('[AUTH:NETWORK]')
    expect(message).toContain('fetch failed')
  })

  it('连接被重置归类为 NETWORK', async () => {
    const message = await loginFailure({ message: 'read ECONNRESET', status: 0 })
    expect(message).toContain('[AUTH:NETWORK]')
  })

  it('离线降级的合成 503 归类为 NETWORK 而不是服务端异常', async () => {
    const message = await loginFailure({ message: '网络不可达（离线降级）', status: 503, code: 'network_unreachable' })
    expect(message).toContain('[AUTH:NETWORK]')
  })

  it('凭据错误归类为 INVALID_CREDENTIALS', async () => {
    const message = await loginFailure({ message: 'Invalid login credentials', status: 400 })
    expect(message).toContain('[AUTH:INVALID_CREDENTIALS]')
  })

  it('邮箱未验证归类为 EMAIL_NOT_CONFIRMED', async () => {
    const message = await loginFailure({ message: 'Email not confirmed', status: 400 })
    expect(message).toContain('[AUTH:EMAIL_NOT_CONFIRMED]')
  })

  it('频率限制归类为 RATE_LIMITED', async () => {
    const message = await loginFailure({ message: 'Too many requests', status: 429 })
    expect(message).toContain('[AUTH:RATE_LIMITED]')
  })

  it('服务端异常归类为 SERVICE_UNAVAILABLE', async () => {
    const message = await loginFailure({ message: 'Internal server error', status: 500 })
    expect(message).toContain('[AUTH:SERVICE_UNAVAILABLE]')
  })

  it('无法识别的错误归类为 UNKNOWN 并保留原文', async () => {
    const message = await loginFailure({ message: 'something unexpected', status: 400 })
    expect(message).toContain('[AUTH:UNKNOWN]')
    expect(message).toContain('something unexpected')
  })

  it('缺少配置时给出 NOT_CONFIGURED', async () => {
    state.available = false
    const message = await authService.login('user@example.com', 'secret123').catch((err: Error) => err.message)
    expect(message).toContain('[AUTH:NOT_CONFIGURED]')
  })
})

describe('classifyAuthError', () => {
  it('优先识别网络类错误，避免被 5xx 规则吞掉', () => {
    expect(classifyAuthError({ status: 503, message: 'network_unreachable' })).toBe('NETWORK')
    expect(classifyAuthError({ status: 503, message: '服务维护中' })).toBe('SERVICE_UNAVAILABLE')
  })

  it('未命中规则时返回指定兜底类别', () => {
    expect(classifyAuthError({ message: 'other' }, 'UNKNOWN')).toBe('UNKNOWN')
  })
})
