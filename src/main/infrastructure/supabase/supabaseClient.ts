import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  browserSessionStorage,
  type SupabaseSyncStorage
} from '@main/infrastructure/supabase/browserSessionStorage'

let client: SupabaseClient | null = null

let sessionStorage: SupabaseSyncStorage = browserSessionStorage

/** 在创建客户端前注入平台存储；Electron 入口负责安装加密文件存储。 */
export function setSessionStorage(storage: SupabaseSyncStorage): void {
  sessionStorage = storage
}

export function resolveSessionStorage(): SupabaseSyncStorage {
  return sessionStorage
}

/**
 * 网络不可达时静默降级的 fetch。
 * auth-js 的 _handleRequest 会对 fetch 异常 console.error 全栈打印，离线场景下每次
 * auth 调用都会刷屏。supabase-js 不透传 auth.fetch（_initSupabaseAuthClient 解构时丢弃），
 * 因此在 global 层替换：仅把 DNS/连接级失败（ENOTFOUND/ECONNREFUSED 等）转成合成 503
 * 响应，保留错误契约（走消费方既有的 error 处理路径），由本进程只记录一次警告。
 * 其余异常（超时、abort 等）原样抛出，不改变行为。
 */
let networkWarningLogged = false

const QUIET_ERROR_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT'])

function isNetworkUnreachableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as NodeJS.ErrnoException).code
  if (code && QUIET_ERROR_CODES.has(code)) return true
  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof Error) {
    const causeCode = (cause as NodeJS.ErrnoException).code
    return !!causeCode && QUIET_ERROR_CODES.has(causeCode)
  }
  return false
}

const quietSupabaseFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (!isNetworkUnreachableError(error)) throw error

    if (!networkWarningLogged) {
      networkWarningLogged = true
      console.warn(
        '[Supabase] 网络不可达，Supabase 请求将静默走离线降级:',
        error instanceof Error ? error.message : error
      )
    }
    return new Response(JSON.stringify({ message: '网络不可达（离线降级）', code: 'network_unreachable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

function getSupabaseConfig() {
  // 使用点访问，使 Vite define 能在浏览器构建时替换为公开配置常量。
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (url && key) {
    return { url, key }
  }

  return null
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client

  const config = getSupabaseConfig()
  if (!config) return null

  client = createClient(config.url, config.key, {
    global: {
      fetch: quietSupabaseFetch
    },
    auth: {
      storage: resolveSessionStorage(),
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  })

  return client
}

export function resetSupabaseClient(): void {
  client = null
}
