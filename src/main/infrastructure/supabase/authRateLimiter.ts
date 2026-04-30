type RateLimitEntry = {
  count: number
  resetAt: number
}

const authAttempts = new Map<string, RateLimitEntry>()

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes

export function checkAuthRateLimit(email: string): void {
  const entry = authAttempts.get(email)
  if (!entry) return

  if (Date.now() >= entry.resetAt) {
    authAttempts.delete(email)
    return
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((entry.resetAt - Date.now()) / 1000)
    throw new Error(`登录尝试过于频繁，请 ${remaining} 秒后再试`)
  }
}

export function recordAuthFailure(email: string): void {
  const entry = authAttempts.get(email)
  if (!entry || Date.now() >= entry.resetAt) {
    authAttempts.set(email, { count: 1, resetAt: Date.now() + LOCKOUT_MS })
    return
  }
  entry.count++
}

export function resetAuthRateLimit(email: string): void {
  authAttempts.delete(email)
}
