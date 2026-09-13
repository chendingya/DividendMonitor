import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sessionFileStorage } from '@main/infrastructure/supabase/sessionStorage'

let client: SupabaseClient | null = null

/**
 * 网络不可达时静默降级的 auth 专用 fetch。
 * auth-js 的 _handleRequest 会对 fetch 异常 console.error 全栈打印，离线场景下每次
 * auth 调用都会刷屏。这里把网络层失败转成合成 503 响应，保留 auth-js 的错误契约
 * （AuthApiError），由本进程只记录一次警告。
 */
let networkWarningLogged = false

const quietAuthFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (!networkWarningLogged) {
      networkWarningLogged = true
      console.warn(
        '[Supabase] auth 请求网络不可达，后续失败将静默走离线降级:',
        error instanceof Error ? error.message : error
      )
    }
    return new Response(JSON.stringify({ error: 'network_unreachable', msg: '网络不可达（离线降级）' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

function getSupabaseConfig() {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_ANON_KEY']

  if (url && key) {
    return { url, key }
  }

  return null
}

/** supabase-js 的类型壳未透传 auth-js 的 fetch 选项（运行时支持），此处本地补充类型 */
interface AuthClientOptionsWithFetch {
  storage: typeof sessionFileStorage
  autoRefreshToken: boolean
  detectSessionInUrl: boolean
  fetch: typeof quietAuthFetch
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client

  const config = getSupabaseConfig()
  if (!config) return null

  const authOptions: AuthClientOptionsWithFetch = {
    storage: sessionFileStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    fetch: quietAuthFetch
  }

  client = createClient(config.url, config.key, {
    auth: authOptions
  })

  return client
}

export function resetSupabaseClient(): void {
  client = null
}
