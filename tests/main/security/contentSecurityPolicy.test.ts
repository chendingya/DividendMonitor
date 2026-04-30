import { describe, expect, it } from 'vitest'
import { getCspHeader, getSecurityHeaders } from '@main/security/contentSecurityPolicy'

describe('contentSecurityPolicy', () => {
  describe('getCspHeader', () => {
    it('returns a CSP string with required directives in production', () => {
      const csp = getCspHeader(false)
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self'")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).toContain("connect-src 'self' http://127.0.0.1:3210 https://*.supabase.co")
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("object-src 'none'")
    })

    it('does NOT include unsafe-eval in production', () => {
      const csp = getCspHeader(false)
      expect(csp).not.toContain("'unsafe-eval'")
    })

    it('does NOT include WebSocket URLs in production', () => {
      const csp = getCspHeader(false)
      expect(csp).not.toContain('ws://127.0.0.1')
      expect(csp).not.toContain('ws://localhost')
    })

    it('includes unsafe-eval and WebSocket URLs in development', () => {
      const csp = getCspHeader(true)
      expect(csp).toContain("'unsafe-eval'")
      expect(csp).toContain('ws://127.0.0.1:*')
      expect(csp).toContain('ws://localhost:*')
    })

    it('includes Supabase and local API connect-src in both modes', () => {
      expect(getCspHeader(false)).toContain('https://*.supabase.co')
      expect(getCspHeader(false)).toContain('http://127.0.0.1:3210')
      expect(getCspHeader(true)).toContain('https://*.supabase.co')
      expect(getCspHeader(true)).toContain('http://127.0.0.1:3210')
    })
  })

  describe('getSecurityHeaders', () => {
    it('returns all expected security headers', () => {
      const headers = getSecurityHeaders(false)
      expect(headers).toHaveProperty('Content-Security-Policy')
      expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff')
      expect(headers).toHaveProperty('X-Frame-Options', 'DENY')
      expect(headers).toHaveProperty('Referrer-Policy', 'strict-origin-when-cross-origin')
      expect(headers).toHaveProperty('X-Powered-By', '')
    })
  })
})
