/**
 * Content-Security-Policy strategy generator.
 *
 * Production: strict CSP that only allows self + Supabase endpoints.
 * Development: relaxed to support Vite HMR (WebSocket + eval).
 */

const SUPABASE_CONNECT_SRC = 'https://*.supabase.co'
const LOCAL_API_ORIGIN = 'http://127.0.0.1:3210'

function buildBasePolicy(): Record<string, string[]> {
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"], // antd uses inline styles
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", LOCAL_API_ORIGIN, SUPABASE_CONNECT_SRC],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"]
  }
}

function serializePolicy(policy: Record<string, string[]>): string {
  return Object.entries(policy)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ')
}

export function getCspHeader(isDevelopment: boolean): string {
  const policy = buildBasePolicy()

  if (isDevelopment) {
    // Vite HMR needs WebSocket connection and eval for hot module replacement
    policy['script-src']!.push("'unsafe-eval'", "'unsafe-inline'")
    policy['style-src']!.push('blob:')
    policy['connect-src']!.push('ws://127.0.0.1:*', 'ws://localhost:*')
  }

  return serializePolicy(policy)
}

/**
 * Standard security headers to apply to all HTTP responses.
 */
export function getSecurityHeaders(isDevelopment: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': getCspHeader(isDevelopment),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Remove Server header info leak
    'X-Powered-By': ''
  }
}
