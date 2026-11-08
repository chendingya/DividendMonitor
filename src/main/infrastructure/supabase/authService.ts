import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { setRuntimeMode } from '@main/infrastructure/supabase/runtimeMode'
import { encodeAuthError, type AuthErrorCode } from '@shared/authErrors'
import type { Session, User } from '@supabase/supabase-js'

/** Supabase User type does not expose `identities` in its TS definition,
 *  but the runtime object includes it. We extend the type locally to avoid `any`. */
type SupabaseUserWithIdentities = User & {
  identities?: Array<{ id: string; [key: string]: unknown }>
}

export type AuthSession = {
  user: { id: string; email?: string }
  expiresAt: number
}

// In-memory session cache to avoid repeated Supabase auth queries
let cachedSession: AuthSession | null = null
let authListenerUnsubscribe: (() => void) | null = null

function toAuthSession(session: Session | null): AuthSession | null {
  if (!session?.user) return null
  return {
    user: {
      id: session.user.id,
      email: session.user.email
    },
    expiresAt: session.expires_at ?? 0
  }
}

type SupabaseAuthErrorLike = {
  status?: number
  code?: string
  message?: string
}

const NETWORK_ERROR_PATTERN =
  /network_unreachable|network unavailable|network error|网络不可达|fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR|net::ERR/i

/** 把 Supabase / 传输层错误归类，供渲染层展示「原因 + 处理建议」。 */
export function classifyAuthError(error: SupabaseAuthErrorLike, fallback: AuthErrorCode = 'UNKNOWN'): AuthErrorCode {
  const message = error.message ?? ''
  const code = error.code ?? ''
  const combined = `${code} ${message}`

  if (NETWORK_ERROR_PATTERN.test(combined)) return 'NETWORK'
  if (error.status === 429 || /rate limit|too many requests|over_email_send_rate_limit/i.test(combined)) return 'RATE_LIMITED'
  if (typeof error.status === 'number' && error.status >= 500) return 'SERVICE_UNAVAILABLE'
  if (/invalid login credentials/i.test(message)) return 'INVALID_CREDENTIALS'
  if (/email not confirmed|email_not_confirmed/i.test(combined)) return 'EMAIL_NOT_CONFIRMED'
  if (/already registered|already been registered|user already exists/i.test(message)) return 'EMAIL_REGISTERED'
  if (/password should be at least|weak.?password/i.test(combined)) return 'WEAK_PASSWORD'
  if (/invalid email|email address .* invalid|unable to validate email/i.test(combined)) return 'INVALID_EMAIL'
  return fallback
}

function toAuthError(error: SupabaseAuthErrorLike, fallback: AuthErrorCode = 'UNKNOWN'): Error {
  const code = classifyAuthError(error, fallback)
  const detail = error.message?.trim()
  return new Error(encodeAuthError(code, detail))
}

/** 邮件确认回调地址：跟随 LOCAL_HTTP_API_PORT（端口退避后仍可直达 API） */
function getAuthCallbackUrl(): string | undefined {
  // 浏览器沿用 Supabase 的 Site URL；本机 HTTP 回调只适用于桌面运行时。
  if (typeof process === 'undefined') return undefined
  const port = process.env['LOCAL_HTTP_API_PORT']?.trim()
  if (port && /^\d+$/.test(port)) {
    return `http://127.0.0.1:${port}/auth/callback`
  }
  return 'http://127.0.0.1:3210/auth/callback'
}

/** 登录态广播器（默认 no-op）：桌面端由 electronBroadcasters 注入 BrowserWindow 推送实现 */
let authStateBroadcaster: (session: AuthSession | null) => void = () => undefined

/** 进程内订阅者（inprocess 运行时直连用例时注册），与广播器并行收到同一 session */
const authStateListeners = new Set<(session: AuthSession | null) => void>()

/** 注入登录态广播器（幂等覆盖）。 */
export function setAuthStateBroadcaster(fn: (session: AuthSession | null) => void): void {
  authStateBroadcaster = fn
}

/**
 * 订阅登录态变化（inprocess 运行时用）：注册内部监听者，返回取消订阅函数。
 * 不占用广播器注入位——broadcastAuthChange 仍会先通知全部订阅者、再调用注入的
 * 广播器，桌面端 BrowserWindow 推送行为保持不变。
 */
export function subscribeAuthState(cb: (session: AuthSession | null) => void): () => void {
  authStateListeners.add(cb)
  return () => {
    authStateListeners.delete(cb)
  }
}

function broadcastAuthChange(session: AuthSession | null): void {
  for (const listener of authStateListeners) {
    listener(session)
  }
  authStateBroadcaster(session)
}

export function startAuthListener(): void {
  const supabase = getSupabaseClient()
  if (!supabase || authListenerUnsubscribe) return

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const authSession = toAuthSession(session)
    cachedSession = authSession
    setRuntimeMode(authSession ? 'online' : 'offline')
    broadcastAuthChange(authSession)
  })

  authListenerUnsubscribe = data.subscription.unsubscribe
}

export function stopAuthListener(): void {
  if (authListenerUnsubscribe) {
    authListenerUnsubscribe()
    authListenerUnsubscribe = null
  }
}

export const authService = {
  async login(email: string, password: string): Promise<AuthSession | null> {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error(encodeAuthError('NOT_CONFIGURED'))

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw toAuthError(error)

    const session = toAuthSession(data.session)
    cachedSession = session
    setRuntimeMode(session ? 'online' : 'offline')
    return session
  },

  async register(email: string, password: string): Promise<{ session: AuthSession | null; needsConfirmation: boolean }> {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error(encodeAuthError('NOT_CONFIGURED'))

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthCallbackUrl()
      }
    })

    if (error) throw toAuthError(error)

    // Supabase security measure: for duplicate emails with email confirmation enabled,
    // it silently returns { session: null, user.identities: [] } instead of an error.
    // We detect this by checking if identities is empty.
    if (data?.user && (data.user as SupabaseUserWithIdentities).identities?.length === 0) {
      throw new Error(encodeAuthError('EMAIL_REGISTERED'))
    }

    if (data?.session) {
      // Auto-confirmed (email confirmation disabled in Supabase)
      const session = toAuthSession(data.session)
      cachedSession = session
      setRuntimeMode('online')
      return { session, needsConfirmation: false }
    }

    // Email confirmation required — user must click the link in their email
    return { session: null, needsConfirmation: true }
  },

  async confirmEmailToken(accessToken: string, refreshToken?: string): Promise<AuthSession | null> {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error(encodeAuthError('NOT_CONFIGURED'))

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken ?? ''
    })
    if (error) throw toAuthError(error)

    const session = toAuthSession(data.session)
    cachedSession = session
    setRuntimeMode(session ? 'online' : 'offline')
    return session
  },

  async updatePassword(newPassword: string): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error(encodeAuthError('NOT_CONFIGURED'))

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw toAuthError(error)
  },

  async logout(): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return

    const { error } = await supabase.auth.signOut()
    if (error) throw toAuthError(error)
    cachedSession = null
    setRuntimeMode('offline')
  },

  async getSession(): Promise<AuthSession | null> {
    // Return cached session if available and still valid.
    // Supabase client has autoRefreshToken: true, so token refresh is handled
    // by the onAuthStateChange listener — when a token is refreshed, the listener
    // fires and updates cachedSession automatically.
    if (cachedSession) {
      if (cachedSession.expiresAt > Date.now() / 1000) {
        return cachedSession
      }
      // Session expired — clear cache so we fetch a fresh one from Supabase
      // (which will auto-refresh the token if possible)
      cachedSession = null
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      setRuntimeMode('offline')
      return null
    }

    try {
      const { data } = await supabase.auth.getSession()
      const session = toAuthSession(data.session)
      cachedSession = session
      setRuntimeMode(session ? 'online' : 'offline')
      return session
    } catch (error) {
      console.warn('[Auth] getSession failed, switching to offline mode:', (error as Error).message)
      setRuntimeMode('offline')
      return null
    }
  },

  async initSession(): Promise<AuthSession | null> {
    try {
      const session = await authService.getSession()
      setRuntimeMode(session ? 'online' : 'offline')

      // Start listening for auth state changes after initial session check
      startAuthListener()

      return session
    } catch (error) {
      console.warn('[Auth] initSession failed, staying offline:', (error as Error).message)
      setRuntimeMode('offline')
      return null
    }
  }
}
