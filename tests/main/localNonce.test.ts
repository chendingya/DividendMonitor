import { describe, it, expect, beforeEach } from 'vitest'
import { generateNonce, getNonce, validateNonce } from '@main/security/localNonce'

describe('localNonce', () => {
  beforeEach(() => {
    generateNonce()
  })

  it('should generate a non-null nonce', () => {
    const nonce = getNonce()
    expect(nonce).toBeTruthy()
    expect(typeof nonce).toBe('string')
  })

  it('should generate UUID format nonce', () => {
    const nonce = getNonce()
    expect(nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('should validate correct nonce', () => {
    const nonce = getNonce()
    expect(validateNonce(nonce)).toBe(true)
  })

  it('should reject incorrect nonce', () => {
    expect(validateNonce('wrong-nonce-value')).toBe(false)
  })

  it('should reject undefined nonce', () => {
    expect(validateNonce(undefined)).toBe(false)
  })

  it('should reject empty string nonce', () => {
    expect(validateNonce('')).toBe(false)
  })

  it('should be consistent after multiple getNonce calls', () => {
    const first = getNonce()
    const second = getNonce()
    expect(first).toBe(second)
  })

  it('should regenerate when generateNonce is called again', () => {
    const first = getNonce()
    generateNonce()
    const second = getNonce()
    expect(first).not.toBe(second)
    expect(validateNonce(second)).toBe(true)
    expect(validateNonce(first)).toBe(false)
  })
})
