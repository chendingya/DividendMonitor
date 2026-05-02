import type { ProviderKey } from '@main/infrastructure/dataSources/types/sourceTypes'

type Deferred<T> = {
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export class ConcurrencyLimiter {
  private readonly slots = new Map<ProviderKey, number>()
  private readonly waiters = new Map<ProviderKey, Array<Deferred<void>>>()

  constructor(private readonly maxPerProvider: number = 1) {}

  async acquire(provider: ProviderKey): Promise<void> {
    const used = this.slots.get(provider) ?? 0

    if (used < this.maxPerProvider) {
      this.slots.set(provider, used + 1)
      return
    }

    return new Promise<void>((resolve, reject) => {
      const queue = this.waiters.get(provider) ?? []
      queue.push({ resolve, reject })
      this.waiters.set(provider, queue)
    })
  }

  release(provider: ProviderKey): void {
    const used = this.slots.get(provider) ?? 0
    this.slots.set(provider, Math.max(0, used - 1))

    const queue = this.waiters.get(provider)
    if (queue && queue.length > 0) {
      const next = queue.shift()!
      this.slots.set(provider, (this.slots.get(provider) ?? 0) + 1)
      next.resolve()
    }
  }
}
