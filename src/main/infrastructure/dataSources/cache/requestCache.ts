import type { SourceRequest, SourceResponse } from '@main/infrastructure/dataSources/types/sourceTypes'

type CachedEntry<T> = {
  response: SourceResponse<T>
  cachedAt: string
}

export class RequestCache {
  private readonly cache = new Map<string, CachedEntry<unknown>>()

  getFresh<T>(key: string, ttlMs?: number): SourceResponse<T> | null {
    const entry = this.cache.get(key) as CachedEntry<T> | undefined
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

    const entry = this.cache.get(key) as CachedEntry<T> | undefined
    if (!entry) return null

    const now = Date.now()
    const cachedAt = new Date(entry.cachedAt).getTime()
    const staleDeadline = cachedAt + staleTtlMs

    if (now > staleDeadline) {
      // Even stale cache is too old
      this.cache.delete(key)
      return null
    }

    // Return as stale
    return {
      ...entry.response,
      isStale: true
    }
  }

  set<T>(key: string, response: SourceResponse<T>): void {
    this.cache.set(key, {
      response,
      cachedAt: new Date().toISOString()
    })
  }

  buildKey(request: SourceRequest<unknown>): string {
    // Use capability + stringified input as cache key
    const inputKey = this.stableStringify(request.input)
    return `${request.capability}:${inputKey}`
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
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
