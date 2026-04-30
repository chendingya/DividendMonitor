import { getSupabaseClient, resetSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { setRuntimeMode } from '@main/infrastructure/supabase/runtimeMode'
import { BrowserWindow } from 'electron'
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

function broadcastAuthChange(session: AuthSession | null): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('auth:state-changed', session)
  }
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
    if (!supabase) throw new Error('在线服务未配置（缺少 SUPABASE_URL / SUPABASE_ANON_KEY）')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('邮箱或密码错误')
      }
      throw new Error(`登录失败：${error.message}`)
    }

    const session = toAuthSession(data.session)
    cachedSession = session
    setRuntimeMode(session ? 'online' : 'offline')
    return session
  },

  async register(email: string, password: string): Promise<{ session: AuthSession | null; needsConfirmation: boolean }> {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('在线服务未配置（缺少 SUPABASE_URL / SUPABASE_ANON_KEY）')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'http://127.0.0.1:3210/auth/callback'
      }
    })

    if (error) {
      // Supabase may return "User already registered" for duplicate emails
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        throw new Error('该邮箱已注册，请直接登录。')
      }
      throw new Error(`注册失败：${error.message}`)
    }

    // Supabase security measure: for duplicate emails with email confirmation enabled,
    // it silently returns { session: null, user.identities: [] } instead of an error.
    // We detect this by checking if identities is empty.
    if (data?.user && (data.user as SupabaseUserWithIdentities).identities?.length === 0) {
      throw new Error('该邮箱已注册，请直接登录。')
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
    if (!supabase) throw new Error('在线服务未配置（缺少 SUPABASE_URL / SUPABASE_ANON_KEY）')

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken ?? ''
    })
    if (error) throw new Error(`邮箱验证失败：${error.message}`)

    const session = toAuthSession(data.session)
    cachedSession = session
    setRuntimeMode(session ? 'online' : 'offline')
    return session
  },

  async updatePassword(newPassword: string): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('在线服务未配置（缺少 SUPABASE_URL / SUPABASE_ANON_KEY）')

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      throw new Error(`修改密码失败：${error.message}`)
    }
  },

  async logout(): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return

    await supabase.auth.signOut()
    resetSupabaseClient()
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
    if (!supabase) return null

    const { data } = await supabase.auth.getSession()
    const session = toAuthSession(data.session)
    cachedSession = session
    setRuntimeMode(session ? 'online' : 'offline')
    return session
  },

  async initSession(): Promise<AuthSession | null> {
    const session = await authService.getSession()
    setRuntimeMode(session ? 'online' : 'offline')

    // Start listening for auth state changes after initial session check
    startAuthListener()

    return session
  }
}
