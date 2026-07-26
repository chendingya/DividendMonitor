import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LOCAL_HTTP_API_ORIGIN } from '@shared/contracts/api'
import { startLocalHttpServer, stopLocalHttpServer } from '@main/http/server'

/**
 * Smoke test for the browser-preview (headless HTTP) runtime.
 *
 * These endpoints previously had NO HTTP route, so the web build could not
 * authenticate (no nonce) or sync (no sync route) even though the desktop
 * IPC runtime exposed them. Booting the real local server and hitting the
 * routes closes the desktop/web parity gap.
 */
describe('web runtime HTTP routes', () => {
  beforeAll(async () => {
    await startLocalHttpServer()
  })

  afterAll(async () => {
    await stopLocalHttpServer()
  })

  it('exposes a local security nonce for the web runtime', async () => {
    const res = await fetch(`${LOCAL_HTTP_API_ORIGIN}/api/security/nonce`, { method: 'GET' })
    expect(res.status).toBe(200)
    const payload = (await res.json()) as { nonce?: string }
    expect(typeof payload.nonce).toBe('string')
    expect(payload.nonce!.length).toBeGreaterThan(0)
  })

  it('exposes the sync status endpoint for the web runtime', async () => {
    const res = await fetch(`${LOCAL_HTTP_API_ORIGIN}/api/sync/status`, { method: 'GET' })
    expect(res.status).toBe(200)
    const payload = (await res.json()) as { status?: string }
    expect(['synced', 'offline-fallback', 'error']).toContain(payload.status)
  })

  it('rejects an invalid sync direction with 400', async () => {
    const res = await fetch(`${LOCAL_HTTP_API_ORIGIN}/api/sync/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: 'sideways' })
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown api paths', async () => {
    const res = await fetch(`${LOCAL_HTTP_API_ORIGIN}/api/does-not-exist`, { method: 'GET' })
    expect(res.status).toBe(404)
  })
})
