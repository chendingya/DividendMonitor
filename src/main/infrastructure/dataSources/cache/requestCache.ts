import type { SourceRequest, SourceResponse } from '@main/infrastructure/dataSources/types/sourceTypes'

export type CachedEntry<T> = {
  response: SourceResponse<T>
  cachedAt: string
}

/** 可选的持久化后端，用于把请求级缓存落到磁盘（如 SQLite） */
export interface RequestCacheStore {
  get(key: string): CachedEntry<unknown> | null
  set(key: string, entry: CachedEntry<unknown>): void
  delete(key: string): void
  clear(): void
}

export class RequestCache {
  private readonly cache = new Map<string, CachedEntry<unknown>>()

  constructor(private readonly store?: RequestCacheStore) {}

  getFresh<T>(key: string, ttlMs?: number): SourceResponse<T> | null {
    const entry = this.readEntry<T>(key)
    if (!entry) return null

    const now = Date.now()
    const cachedAt = new Date(entry.cachedAt).getTime()

    if (ttlMs && now - cachedAt > ttlMs) {
      return null
    }

    return entry.response
  }

  getStale<T>(key: string, staleTtlMs?: number): SourceResponse<T> | null {
    if (!staleTtlMs) return null

    const entry = this.readEntry<T>(key)
    if (!entry) return null

    const now = Date.now()
    const cachedAt = new Date(entry.cachedAt).getTime()
    const staleDeadline = cachedAt + staleTtlMs

    if (now > staleDeadline) {
      // Even stale cache is too old
      this.cache.delete(key)
      this.store?.delete(key)
      return null
    }

    // Return as stale
    return {
      ...entry.response,
      isStale: true
    }
  }

  set<T>(key: string, response: SourceResponse<T>): void {
    const entry: CachedEntry<unknown> = {
      response,
      cachedAt: new Date().toISOString()
    }
    this.cache.set(key, entry)
    this.store?.set(key, entry)
  }

  /** 内存优先读取；未命中时回填磁盘条目 */
  private readEntry<T>(key: string): CachedEntry<T> | undefined {
    const memoryEntry = this.cache.get(key) as CachedEntry<T> | undefined
    if (memoryEntry) {
      return memoryEntry
    }
    const diskEntry = this.store?.get(key) ?? null
    if (diskEntry) {
      this.cache.set(key, diskEntry)
    }
    return diskEntry as CachedEntry<T> | undefined
  }

  buildKey(request: SourceRequest<unknown>): string {
    // Use capability + stringified input as cache key
    const inputKey = this.stableStringify(request.input)
    return `${request.capability}:${inputKey}`
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key)
      this.store?.delete(key)
    } else {
      this.cache.clear()
      this.store?.clear()
    }
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      return `{${entries.map(([key, item]) => `${key}:${this.stableStringify(item)}`).join(',')}}`
    }
    return JSON.stringify(value)
  }
}

let defaultRequestCache: RequestCache | undefined

export function getDefaultRequestCache(): RequestCache {
  if (!defaultRequestCache) {
    defaultRequestCache = new RequestCache()
  }
  return defaultRequestCache
}
