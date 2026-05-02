import { describe, expect, it } from 'vitest'
import { RateLimiter } from '@main/infrastructure/dataSources/guards/rateLimiter'

describe('RateLimiter', () => {
  it('allows requests within capacity', async () => {
    const limiter = new RateLimiter(3, 60000)

    await limiter.acquire('eastmoney')
    await limiter.acquire('eastmoney')
    await limiter.acquire('eastmoney')

    // No assertions needed — it didn't throw or hang
  })

  it('tracks per-provider independently', async () => {
    const limiter = new RateLimiter(1, 60000)

    await limiter.acquire('eastmoney')
    await limiter.acquire('sina') // different provider, should not block

    // Both succeeded — eastmoney exhausted but sina still has tokens
  })

  it('rate limits the same provider', async () => {
    const limiter = new RateLimiter(1, 100)

    await limiter.acquire('eastmoney')

    // Second call should be delayed until refill
    const start = Date.now()
    await limiter.acquire('eastmoney')
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(80)
  })
})
