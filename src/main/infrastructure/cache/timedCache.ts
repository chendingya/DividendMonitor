type CacheEntry<V> = {
  expiresAt: number
  value: V
}

export class TimedCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>()

  constructor(private readonly ttlMs: number) {}

  getFresh(key: K): { value: V } | undefined {
    const entry = this.store.get(key)
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return { value: entry.value }
  }

  set(key: K, value: V): void {
    this.store.set(key, { expiresAt: Date.now() + this.ttlMs, value })
  }

  delete(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}
