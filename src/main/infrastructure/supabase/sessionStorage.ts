import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

const ENCRYPTED_SESSION_FILE = 'supabase-session.enc'
const LEGACY_SESSION_FILE = 'supabase-session.json'

function getEncryptedSessionFilePath(): string {
  return join(app.getPath('userData'), ENCRYPTED_SESSION_FILE)
}

function getLegacySessionFilePath(): string {
  return join(app.getPath('userData'), LEGACY_SESSION_FILE)
}

function canEncrypt(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/** Read the encrypted session file and decrypt values */
function readEncryptedSessionFile(): Record<string, string> {
  try {
    const path = getEncryptedSessionFilePath()
    if (!existsSync(path)) return {}
    const raw = readFileSync(path, 'utf-8')
    const encrypted: Record<string, string> = JSON.parse(raw)
    const result: Record<string, string> = {}
    for (const [key, base64Value] of Object.entries(encrypted)) {
      try {
        const buffer = Buffer.from(base64Value, 'base64')
        result[key] = safeStorage.decryptString(buffer)
      } catch {
        console.warn(`[SupabaseSessionStorage] Failed to decrypt key "${key}", skipping`)
      }
    }
    return result
  } catch {
    return {}
  }
}

/** Fallback: read legacy plaintext session file */
function readLegacySessionFile(): Record<string, string> {
  try {
    const path = getLegacySessionFilePath()
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

/** Write session data with encryption */
function writeEncryptedSessionFile(data: Record<string, string>): void {
  try {
    const path = getEncryptedSessionFilePath()
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const encrypted: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      const encBuffer = safeStorage.encryptString(value)
      encrypted[key] = encBuffer.toString('base64')
    }

    writeFileSync(path, JSON.stringify(encrypted, null, 2), 'utf-8')
  } catch (err) {
    console.error('[SupabaseSessionStorage] Failed to write encrypted session file:', err)
  }
}

/** Fallback: write plaintext session file (when safeStorage unavailable) */
function writePlaintextSessionFile(data: Record<string, string>): void {
  try {
    const path = getLegacySessionFilePath()
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[SupabaseSessionStorage] Failed to write plaintext session file:', err)
  }
}

/** Read from whichever file exists (encrypted takes priority) */
function readSessionFile(): Record<string, string> {
  if (canEncrypt()) {
    // Try encrypted file first
    const encPath = getEncryptedSessionFilePath()
    if (existsSync(encPath)) {
      return readEncryptedSessionFile()
    }
  }

  // Fall back to legacy plaintext file
  return readLegacySessionFile()
}

/** Write with encryption if available, otherwise plaintext fallback */
function writeSessionFile(data: Record<string, string>): void {
  if (canEncrypt()) {
    writeEncryptedSessionFile(data)
    // Clean up legacy plaintext file if it exists
    try {
      const legacyPath = getLegacySessionFilePath()
      if (existsSync(legacyPath)) {
        unlinkSync(legacyPath)
      }
    } catch {
      // Ignore cleanup errors
    }
  } else {
    writePlaintextSessionFile(data)
  }
}

/** Migrate legacy plaintext session to encrypted format on startup */
export function migrateLegacySession(): void {
  if (!canEncrypt()) return

  const encPath = getEncryptedSessionFilePath()
  const legacyPath = getLegacySessionFilePath()

  // Only migrate if legacy exists and encrypted doesn't
  if (!existsSync(legacyPath) || existsSync(encPath)) return

  try {
    const legacyData = readLegacySessionFile()
    if (Object.keys(legacyData).length > 0) {
      writeEncryptedSessionFile(legacyData)
      unlinkSync(legacyPath)
      console.info('[SupabaseSessionStorage] Migrated legacy session to encrypted storage')
    }
  } catch (err) {
    console.warn('[SupabaseSessionStorage] Failed to migrate legacy session:', err)
  }
}

export const sessionFileStorage = {
  getItem(key: string): string | null {
    const data = readSessionFile()
    return data[key] ?? null
  },

  setItem(key: string, value: string): void {
    const data = readSessionFile()
    data[key] = value
    writeSessionFile(data)
  },

  removeItem(key: string): void {
    const data = readSessionFile()
    delete data[key]
    writeSessionFile(data)
  }
}
