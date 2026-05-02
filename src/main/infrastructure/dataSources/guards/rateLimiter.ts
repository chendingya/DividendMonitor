import type { ProviderKey } from '@main/infrastructure/dataSources/types/sourceTypes'

const BUCKET_CAPACITY = 5
const REFILL_INTERVAL_MS = 1000

type TokenBucket = {
  tokens: number
  lastRefill: number
}

export class RateLimiter {
  private readonly buckets = new Map<ProviderKey, TokenBucket>()

  constructor(
    private readonly maxTokens: number = BUCKET_CAPACITY,
    private readonly refillIntervalMs: number = REFILL_INTERVAL_MS
  ) {}

  async acquire(provider: ProviderKey): Promise<void> {
    let bucket = this.buckets.get(provider)
    const now = Date.now()

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now }
      this.buckets.set(provider, bucket)
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill
    const refillCount = Math.floor(elapsed / this.refillIntervalMs) * this.maxTokens
    if (refillCount > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refillCount)
      bucket.lastRefill = now
    }

    if (bucket.tokens > 0) {
      bucket.tokens -= 1
      return
    }

    // Wait until next refill tick
    const waitMs = this.refillIntervalMs - (now - bucket.lastRefill)
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs)))

    // Retry after wait
    return this.acquire(provider)
  }
}
