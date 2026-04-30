import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkAuthRateLimit, recordAuthFailure, resetAuthRateLimit } from '@main/infrastructure/supabase/authRateLimiter'

describe('authRateLimiter', () => {
  const email = 'test@example.com'

  beforeEach(() => {
    resetAuthRateLimit(email)
    vi.useRealTimers()
  })

  it('should allow initial attempts', () => {
    expect(() => checkAuthRateLimit(email)).not.toThrow()
  })

  it('should throw after MAX_ATTEMPTS (5) failures', () => {
    for (let i = 0; i < 5; i++) {
      recordAuthFailure(email)
    }
    // The 5th failure should trigger the rate limit
    // Max is 5, so the 5th count >= MAX_ATTEMPTS, next check throws
    expect(() => checkAuthRateLimit(email)).toThrow('登录尝试过于频繁')
  })

  it('should reset rate limit after calling resetAuthRateLimit', () => {
    for (let i = 0; i < 5; i++) {
      recordAuthFailure(email)
    }
    resetAuthRateLimit(email)
    expect(() => checkAuthRateLimit(email)).not.toThrow()
  })

  it('should reset rate limit when lockout time expires', () => {
    vi.useFakeTimers()
    const now = Date.now()
    vi.setSystemTime(now)

    for (let i = 0; i < 5; i++) {
      recordAuthFailure(email)
    }
    expect(() => checkAuthRateLimit(email)).toThrow()

    // Fast-forward past 5-minute lockout
    vi.setSystemTime(now + 5 * 60 * 1000 + 1)
    expect(() => checkAuthRateLimit(email)).not.toThrow()
  })

  it('should track different emails independently', () => {
    const email2 = 'other@example.com'

    for (let i = 0; i < 5; i++) {
      recordAuthFailure(email)
    }
    // email is locked, but email2 should still be fine
    expect(() => checkAuthRateLimit(email)).toThrow()
    expect(() => checkAuthRateLimit(email2)).not.toThrow()
  })
})
