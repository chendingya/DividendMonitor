import type { IncomingMessage } from 'node:http'
import type { ServerResponse } from 'node:http'
import { getNonce } from '@main/security/localNonce'
import { sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
  headers: IncomingMessage['headers']
}

/**
 * Local security endpoints for the browser-preview (headless HTTP) runtime.
 *
 * In the Electron desktop runtime the renderer reads the nonce from an HTML
 * `<meta>` tag and forwards it as the `X-Local-Nonce` header. In the
 * headless browser-preview runtime there is no preload bridge, so the
 * renderer obtains the same nonce over HTTP here.
 *
 * This endpoint is deliberately exempt from the nonce check applied by
 * @main/http/server to all other /api routes. The local API's threat model:
 * CORS is locked to a strict loopback-origin whitelist (blocking arbitrary
 * web pages), the Host header must be loopback (blocking DNS rebinding),
 * and the nonce itself blocks cross-origin form submissions, which cannot
 * carry custom headers. A malicious local process is out of scope — it can
 * always read process memory or the SQLite file directly.
 */
export async function handleSecurityRoute({ pathname, method, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/security/nonce' && method === 'GET') {
    sendJson(response, 200, { nonce: getNonce() })
    return true
  }

  return false
}
