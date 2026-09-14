import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionFileStorage } from '@main/infrastructure/supabase/sessionStorage'
import {
  browserSessionStorage,
  type SupabaseSyncStorage
} from '@main/infrastructure/supabase/browserSessionStorage'
import { resolveSessionStorage } from '@main/infrastructure/supabase/supabaseClient'

// sessionFileStorage 顶层依赖 electron（app/safeStorage），纯 node 测试环境 mock 掉；
// 本测试不触发其文件读写，mock 仅保证模块可导入。
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userdata' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: () => 'decrypted-value'
  }
}))

/** 可断言键值的内存 localStorage 替身 */
function installMemoryLocalStorage(): Map<string, string> {
  const map = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    }
  }
  return map
}

function uninstallMemoryLocalStorage(): void {
  delete (globalThis as { localStorage?: unknown }).localStorage
}

describe('browserSessionStorage', () => {
  afterEach(() => {
    uninstallMemoryLocalStorage()
  })

  it('与 sessionFileStorage 方法形状一致（结构契约）', () => {
    const fileKeys = Object.keys(sessionFileStorage).sort()
    const browserKeys = Object.keys(browserSessionStorage).sort()
    expect(browserKeys).toEqual(fileKeys)
    expect(browserKeys).toEqual(['getItem', 'removeItem', 'setItem'])

    const file = sessionFileStorage as unknown as Record<string, (...args: unknown[]) => unknown>
    const browser = browserSessionStorage as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >
    for (const key of fileKeys) {
      expect(typeof browser[key]).toBe('function')
      expect(browser[key].length).toBe(file[key].length)
    }
  })

  it('getItem/setItem/removeItem 同步往返，值保持 plain string', () => {
    const backing = installMemoryLocalStorage()

    const setResult = browserSessionStorage.setItem('sb:auth-token', '{"access_token":"abc"}')
    expect(setResult).toBeUndefined()
    expect(setResult).not.toBeInstanceOf(Promise)

    // 键名带 supabase-session: 前缀，值原样存取（与文件存储的 plain string 值形态一致）
    expect(backing.get('supabase-session:sb:auth-token')).toBe('{"access_token":"abc"}')

    const getResult = browserSessionStorage.getItem('sb:auth-token')
    expect(getResult).toBe('{"access_token":"abc"}')
    expect(getResult).not.toBeInstanceOf(Promise)

    browserSessionStorage.removeItem('sb:auth-token')
    expect(browserSessionStorage.getItem('sb:auth-token')).toBeNull()
  })

  it('未命中键返回 null；localStorage 异常时读返回 null、写不抛错', () => {
    installMemoryLocalStorage()
    expect(browserSessionStorage.getItem('missing')).toBeNull()

    // localStorage 抛异常（如隐私模式配额错误）时静默降级，与文件存储的容错语义一致
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('quota exceeded')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {
        throw new Error('quota exceeded')
      }
    }
    expect(browserSessionStorage.getItem('k')).toBeNull()
    expect(() => browserSessionStorage.setItem('k', 'v')).not.toThrow()
    expect(() => browserSessionStorage.removeItem('k')).not.toThrow()
  })

  it('满足 supabase-js 同步 storage 契约（SupabaseSyncStorage）', () => {
    const adapter: SupabaseSyncStorage = browserSessionStorage
    expect(typeof adapter.getItem).toBe('function')
    expect(typeof adapter.setItem).toBe('function')
    expect(typeof adapter.removeItem).toBe('function')
  })
})

describe('resolveSessionStorage', () => {
  afterEach(() => {
    uninstallMemoryLocalStorage()
  })

  it('非 Electron（如 vitest node 环境，无 process.versions.electron）返回 browserSessionStorage', () => {
    expect((process.versions as { electron?: string }).electron).toBeUndefined()
    expect(resolveSessionStorage()).toBe(browserSessionStorage)
  })

  it('Electron main（process.versions.electron 存在）返回 sessionFileStorage', () => {
    ;(process.versions as { electron?: string }).electron = '35.0.0'
    try {
      expect(resolveSessionStorage()).toBe(sessionFileStorage)
    } finally {
      delete (process.versions as { electron?: string }).electron
    }
  })

  it('process 不存在（浏览器 bundle 场景）返回 browserSessionStorage 且不抛错', () => {
    const original = (globalThis as { process?: unknown }).process
    ;(globalThis as { process?: unknown }).process = undefined
    try {
      expect(resolveSessionStorage()).toBe(browserSessionStorage)
    } finally {
      ;(globalThis as { process?: unknown }).process = original
    }
  })
})
