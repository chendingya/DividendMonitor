import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthSessionDto, SyncStatusDto } from '@shared/contracts/api'
import { getAuthDesktopApi, getSyncDesktopApi } from '@renderer/services/desktopApi'

type AuthState = {
  mode: 'offline' | 'online'
  session: AuthSessionDto
  loading: boolean
  syncStatus: SyncStatusDto | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  skipLogin: () => void
}

const AuthContext = createContext<AuthState>({
  mode: 'offline',
  session: null,
  loading: true,
  syncStatus: null,
  login: async () => {},
  register: async () => null,
  logout: async () => {},
  skipLogin: () => {}
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSessionDto>(null)
  const [mode, setMode] = useState<'offline' | 'online'>('offline')
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatusDto | null>(null)

  // Initialize: check existing session
  useEffect(() => {
    let disposed = false

    getAuthDesktopApi()
      .getSession()
      .then((s) => {
        if (!disposed && s) {
          setSession(s)
          setMode('online')
        }
        if (!disposed) setLoading(false)
      })
      .catch(() => {
        if (!disposed) setLoading(false)
      })

    return () => { disposed = true }
  }, [])

  // Subscribe to auth state changes from main process
  useEffect(() => {
    const unsubscribe = getAuthDesktopApi().onAuthStateChange((updatedSession) => {
      setSession(updatedSession)
      setMode(updatedSession ? 'online' : 'offline')
    })

    return unsubscribe
  }, [])

  // Subscribe to sync status changes from main process
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    try {
      const syncApi = getSyncDesktopApi()
      unsubscribe = syncApi.onStatusChange((status) => {
        setSyncStatus(status)
      })
    } catch {
      // Sync API not available in current runtime (e.g. browser mode)
    }

    return () => { unsubscribe?.() }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const authApi = getAuthDesktopApi()
    const s = await authApi.login(email, password)
    if (!s) throw new Error('登录失败：未返回会话')
    setSession(s)
    setMode('online')
  }, [])

  const register = useCallback(async (email: string, password: string): Promise<string | null> => {
    const authApi = getAuthDesktopApi()
    const result = await authApi.register(email, password)
    if (!result) {
      throw new Error('注册失败：服务未返回结果')
    }
    if (result.session) {
      setSession(result.session)
      setMode('online')
      return null
    }
    if (result.needsConfirmation) {
      return '注册成功！请查收邮箱并点击确认链接，验证后即可登录。'
    }
    throw new Error('注册失败：未返回会话')
  }, [])

  const logout = useCallback(async () => {
    const authApi = getAuthDesktopApi()
    await authApi.logout()
    setSession(null)
    setMode('offline')
    setSyncStatus(null)
  }, [])

  const skipLogin = useCallback(() => {
    setMode('offline')
    setSession(null)
    setLoading(false)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ mode, session, loading, syncStatus, login, register, logout, skipLogin }),
    [mode, session, loading, syncStatus, login, register, logout, skipLogin]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
