/**
 * 浏览器运行时的 Supabase 会话存储适配器（localStorage）。
 *
 * 与 `sessionFileStorage`（Electron main，safeStorage 加密文件）实现完全相同的
 * 同步存储契约（见 SupabaseSyncStorage）：
 *   getItem(key) → string | null（同步）
 *   setItem(key, value) → void（同步）
 *   removeItem(key) → void（同步）
 *
 * 值形态与文件存储一致：plain string 原样存取（supabase-js 存入的本就是
 * JSON 序列化后的字符串）；文件侧的加密在浏览器中不存在——localStorage
 * 明文存储属预期行为。每个键以 `supabase-session:` 为前缀写入 localStorage。
 *
 * 注意：本模块会进入浏览器 bundle，禁止任何 node/electron import；
 * localStorage 在方法调用时才解析（globalThis），模块导入永不抛错，
 * 也便于测试注入替身。
 */

/** supabase-js auth storage 契约（同步形态，与 sessionFileStorage 签名一致） */
export interface SupabaseSyncStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const KEY_PREFIX = 'supabase-session:'

/** 调用时解析 localStorage，未定义（纯 node 场景）或被禁用时返回 null */
function getLocalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  return (globalThis as { localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> })
    .localStorage ?? null
}

export const browserSessionStorage: SupabaseSyncStorage = {
  getItem(key: string): string | null {
    try {
      return getLocalStorage()?.getItem(KEY_PREFIX + key) ?? null
    } catch {
      return null
    }
  },

  setItem(key: string, value: string): void {
    try {
      getLocalStorage()?.setItem(KEY_PREFIX + key, value)
    } catch (err) {
      console.warn('[SupabaseSessionStorage] Failed to write browser session storage:', err)
    }
  },

  removeItem(key: string): void {
    try {
      getLocalStorage()?.removeItem(KEY_PREFIX + key)
    } catch {
      // 移除失败不阻断会话流程
    }
  }
}
