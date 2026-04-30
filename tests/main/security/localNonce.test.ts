import { describe, expect, it, vi, beforeEach } from 'vitest'
import { generateNonce, getNonce, validateNonce } from '@main/security/localNonce'

describe('localNonce', () => {
  beforeEach(() => {
    // Reset module state by re-importing is tricky;
    // generateNonce resets the internal state
  })

  describe('generateNonce', () => {
    it('returns a UUID string', () => {
      const nonce = generateNonce()
      expect(nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('generates different values on each call', () => {
      const a = generateNonce()
      const b = generateNonce()
      expect(a).not.toBe(b)
    })
  })

  describe('getNonce', () => {
    it('generates a nonce if none exists', () => {
      generateNonce() // ensure internal state
      const nonce = getNonce()
      expect(nonce).toBeTruthy()
    })

    it('returns the same nonce on repeated calls', () => {
      generateNonce()
      const a = getNonce()
      const b = getNonce()
      expect(a).toBe(b)
    })
  })

  describe('validateNonce', () => {
    it('returns true for a valid nonce', () => {
      const nonce = generateNonce()
      expect(validateNonce(nonce)).toBe(true)
    })

    it('returns false for an invalid nonce', () => {
      generateNonce()
      expect(validateNonce('wrong-nonce')).toBe(false)
    })

    it('returns false for undefined', () => {
      generateNonce()
      expect(validateNonce(undefined)).toBe(false)
    })

    it('returns false for empty string', () => {
      generateNonce()
      expect(validateNonce('')).toBe(false)
    })

    it('returns false after a new nonce is generated (old nonce invalidated)', () => {
      const oldNonce = generateNonce()
      generateNonce() // generate a new one, invalidating the old
      expect(validateNonce(oldNonce)).toBe(false)
    })
  })
})
