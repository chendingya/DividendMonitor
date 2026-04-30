import { randomUUID, timingSafeEqual } from 'node:crypto'

/**
 * Local HTTP nonce for protecting auth routes against cross-origin requests.
 *
 * The nonce is generated once when the Electron app starts and injected into
 * the renderer's HTML as a <meta> tag. The renderer must include this nonce
 * as an `X-Local-Nonce` header when calling auth-related HTTP endpoints.
 * This prevents malicious processes on the same machine from calling the
 * local auth API unless they can read the renderer's DOM (which CSP mitigates).
 */

let currentNonce: string | null = null

export function generateNonce(): string {
  currentNonce = randomUUID()
  return currentNonce
}

export function getNonce(): string {
  if (!currentNonce) {
    generateNonce()
  }
  return currentNonce!
}

export function validateNonce(headerValue: string | undefined): boolean {
  if (!currentNonce || !headerValue) return false
  const a = Buffer.from(currentNonce)
  const b = Buffer.from(headerValue)
  return a.length === b.length && timingSafeEqual(a, b)
}
