import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'node:path'

const mockEncryptBuffer = Buffer.from('encrypted-data')

const state = {
  encryptionAvailable: true,
  files: new Map<string, string>(),
  writeCalls: [] as any[],
  unlinkCalls: [] as any[]
}

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-userdata'
  },
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    encryptString: () => mockEncryptBuffer,
    decryptString: () => 'decrypted-value'
  }
}))

vi.mock('node:fs', () => ({
  readFileSync: (path: string) => {
    const content = state.files.get(path)
    if (content === undefined) {
      const err = new Error('ENOENT')
      ;(err as any).code = 'ENOENT'
      throw err
    }
    return content
  },
  writeFileSync: (...args: any[]) => {
    state.writeCalls.push(args)
    state.files.set(args[0], args[1])
  },
  existsSync: (path: string) => state.files.has(path),
  mkdirSync: () => {},
  unlinkSync: (...args: any[]) => {
    state.unlinkCalls.push(args)
    state.files.delete(args[0])
  }
}))

const { sessionFileStorage, migrateLegacySession } = await import(
  '@main/infrastructure/supabase/sessionStorage'
)

// Use join() to get the correct path separator for the current OS
const ENC_PATH = join('/tmp/test-userdata', 'supabase-session.enc')
const LEGACY_PATH = join('/tmp/test-userdata', 'supabase-session.json')

describe('sessionStorage', () => {
  beforeEach(() => {
    state.files.clear()
    state.encryptionAvailable = true
    state.writeCalls = []
    state.unlinkCalls = []
  })

  describe('when safeStorage is available', () => {
    it('setItem writes encrypted data (not plaintext)', () => {
      sessionFileStorage.setItem('access_token', 'my-token')

      const encWriteCall = state.writeCalls.find((c) => c[0] === ENC_PATH)
      expect(encWriteCall).toBeTruthy()

      const writtenData = JSON.parse(encWriteCall![1])
      expect(writtenData['access_token']).toBe(mockEncryptBuffer.toString('base64'))
      expect(writtenData['access_token']).not.toBe('my-token')
    })

    it('getItem reads and decrypts the value', () => {
      const encryptedValue = mockEncryptBuffer.toString('base64')
      state.files.set(ENC_PATH, JSON.stringify({ access_token: encryptedValue }))

      const result = sessionFileStorage.getItem('access_token')
      expect(result).toBe('decrypted-value')
    })

    it('getItem returns null for missing key', () => {
      const result = sessionFileStorage.getItem('nonexistent')
      expect(result).toBeNull()
    })

    it('removeItem deletes a key from the encrypted store', () => {
      const encryptedValue = mockEncryptBuffer.toString('base64')
      state.files.set(ENC_PATH, JSON.stringify({
        access_token: encryptedValue,
        refresh_token: encryptedValue
      }))

      sessionFileStorage.removeItem('access_token')

      const lastWrite = state.writeCalls[state.writeCalls.length - 1]
      const writtenData = JSON.parse(lastWrite[1])
      expect(writtenData).not.toHaveProperty('access_token')
      expect(writtenData).toHaveProperty('refresh_token')
    })

    it('cleans up legacy plaintext file on write', () => {
      state.files.set(LEGACY_PATH, '{}')

      sessionFileStorage.setItem('key', 'value')

      expect(state.unlinkCalls.some((c) => c[0] === LEGACY_PATH)).toBe(true)
    })
  })

  describe('when safeStorage is NOT available', () => {
    beforeEach(() => {
      state.encryptionAvailable = false
    })

    it('setItem falls back to plaintext JSON', () => {
      sessionFileStorage.setItem('access_token', 'my-token')

      const plainWriteCall = state.writeCalls.find((c) => c[0] === LEGACY_PATH)
      expect(plainWriteCall).toBeTruthy()

      const writtenData = JSON.parse(plainWriteCall![1])
      expect(writtenData['access_token']).toBe('my-token')
    })

    it('getItem reads from plaintext file', () => {
      state.files.set(LEGACY_PATH, JSON.stringify({ access_token: 'plain-token' }))

      const result = sessionFileStorage.getItem('access_token')
      expect(result).toBe('plain-token')
    })
  })

  describe('migrateLegacySession', () => {
    it('migrates legacy plaintext file to encrypted format', () => {
      state.encryptionAvailable = true
      state.files.set(LEGACY_PATH, JSON.stringify({ access_token: 'legacy-token' }))

      migrateLegacySession()

      const encWriteCall = state.writeCalls.find((c) => c[0] === ENC_PATH)
      expect(encWriteCall).toBeTruthy()

      expect(state.unlinkCalls.some((c) => c[0] === LEGACY_PATH)).toBe(true)
    })

    it('does nothing if no legacy file exists', () => {
      state.encryptionAvailable = true

      migrateLegacySession()

      expect(state.writeCalls).toHaveLength(0)
    })

    it('does nothing if encrypted file already exists', () => {
      state.encryptionAvailable = true
      state.files.set(LEGACY_PATH, JSON.stringify({ access_token: 'token' }))
      state.files.set(ENC_PATH, JSON.stringify({ access_token: 'encrypted' }))

      migrateLegacySession()

      const encWriteCalls = state.writeCalls.filter((c) => c[0] === ENC_PATH)
      expect(encWriteCalls).toHaveLength(0)
    })

    it('does nothing if safeStorage is not available', () => {
      state.encryptionAvailable = false
      state.files.set(LEGACY_PATH, JSON.stringify({ access_token: 'token' }))

      migrateLegacySession()

      expect(state.writeCalls).toHaveLength(0)
    })
  })
})
