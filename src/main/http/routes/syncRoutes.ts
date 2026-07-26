import type { IncomingMessage } from 'node:http'
import type { ServerResponse } from 'node:http'
import { syncData, type SyncDirection } from '@main/application/services/dataSyncService'
import { getLastSyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { sendJson, HttpError } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
  headers: IncomingMessage['headers']
}

const VALID_DIRECTIONS: SyncDirection[] = ['push', 'pull', 'bidirectional']

/**
 * Cloud-sync endpoints for the browser-preview (headless HTTP) runtime.
 *
 * The desktop runtime exposes sync over IPC (`sync:data` /
 * `sync:status-changed`). The headless runtime reuses the exact same
 * `dataSyncService` so web and desktop stay at functional parity.
 */
export async function handleSyncRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/sync/data' && method === 'POST') {
    if (!body || typeof body !== 'object' || !VALID_DIRECTIONS.includes((body as { direction?: SyncDirection }).direction as SyncDirection)) {
      throw new HttpError('同步请求体无效，direction 必须是 push / pull / bidirectional。', 400)
    }

    const { direction } = body as { direction: SyncDirection }
    const result = await syncData(direction)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/sync/status' && method === 'GET') {
    sendJson(response, 200, getLastSyncStatus())
    return true
  }

  return false
}
