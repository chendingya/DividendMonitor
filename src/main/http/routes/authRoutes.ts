import type { IncomingMessage } from 'node:http'
import type { ServerResponse } from 'node:http'
import { authService } from '@main/infrastructure/supabase/authService'
import { checkAuthRateLimit, recordAuthFailure, resetAuthRateLimit } from '@main/infrastructure/supabase/authRateLimiter'
import { validateNonce } from '@main/security/localNonce'
import { HttpError, sendJson, sendNoContent } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
  headers: IncomingMessage['headers']
}

/** Auth-related endpoints require a valid local nonce header */
function requireNonce(headers: IncomingMessage['headers']): void {
  const nonce = headers['x-local-nonce']
  const nonceValue = Array.isArray(nonce) ? nonce[0] : nonce
  if (!validateNonce(nonceValue)) {
    throw new HttpError('缺少或无效的本地认证令牌。', 403)
  }
}

export async function handleAuthRoute({ pathname, method, body, response, headers }: RouteContext): Promise<boolean> {
  if (pathname === '/api/auth/login' && method === 'POST') {
    requireNonce(headers)

    if (!body || typeof body !== 'object' || typeof (body as { email?: unknown }).email !== 'string' || typeof (body as { password?: unknown }).password !== 'string') {
      throw new HttpError('登录请求体无效。', 400)
    }

    const { email, password } = body as { email: string; password: string }
    checkAuthRateLimit(email)
    try {
      const session = await authService.login(email, password)
      resetAuthRateLimit(email)
      sendJson(response, 200, { session })
      return true
    } catch (err) {
      recordAuthFailure(email)
      throw err
    }
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    requireNonce(headers)

    if (!body || typeof body !== 'object' || typeof (body as { email?: unknown }).email !== 'string' || typeof (body as { password?: unknown }).password !== 'string') {
      throw new HttpError('注册请求体无效。', 400)
    }

    const { email, password } = body as { email: string; password: string }
    checkAuthRateLimit(email)
    try {
      const result = await authService.register(email, password)
      resetAuthRateLimit(email)
      sendJson(response, 200, { session: result.session, needsConfirmation: result.needsConfirmation })
      return true
    } catch (err) {
      recordAuthFailure(email)
      throw err
    }
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    await authService.logout()
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/auth/session' && method === 'GET') {
    const session = await authService.getSession()
    sendJson(response, 200, { session })
    return true
  }

  if (pathname === '/api/auth/update-password' && method === 'POST') {
    requireNonce(headers)

    if (!body || typeof body !== 'object' || typeof (body as { newPassword?: unknown }).newPassword !== 'string') {
      throw new HttpError('修改密码请求体无效。', 400)
    }

    const { newPassword } = body as { newPassword: string }
    await authService.updatePassword(newPassword)
    sendJson(response, 200, { ok: true })
    return true
  }

  // Supabase email confirmation callback — user clicks the link from their email
  // and the browser hits this endpoint. We extract the token and let Supabase
  // JS client handle it, then redirect back to the Electron app.
  if (pathname === '/auth/callback' && method === 'GET') {
    // The token is in the URL hash fragment, but hash fragments are not sent
    // to the server. We serve a minimal HTML page that extracts the hash
    // and sends it to Supabase, then notifies the Electron window.
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>验证中…</title></head>
<body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui">
<p>正在验证邮箱，请稍候…</p>
<script type="module">
const hash = window.location.hash.substring(1);
const params = new URLSearchParams(hash);
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');

if (accessToken) {
  // Notify the local API which forwards to Supabase to establish the session
  fetch('/api/auth/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
  }).then(r => r.json()).then(() => {
    document.body.innerHTML = '<p style="color:green">✓ 验证成功！请返回应用。</p>';
    // Try to close this browser tab (works if opened by JS, silently fails otherwise)
    setTimeout(() => window.close(), 2000);
  }).catch(err => {
    document.body.innerHTML = '<p style="color:red">验证失败：' + err.message + '</p>';
  });
} else {
  document.body.innerHTML = '<p style="color:red">无效的验证链接。</p>';
}
</script></body></html>`)
    return true
  }

  // Internal endpoint called by the /auth/callback HTML page
  if (pathname === '/api/auth/confirm' && method === 'POST') {
    if (!body || typeof body !== 'object' || typeof (body as { access_token?: unknown }).access_token !== 'string') {
      throw new HttpError('确认请求体无效。', 400)
    }

    const { access_token, refresh_token } = body as { access_token: string; refresh_token?: string }
    await authService.confirmEmailToken(access_token, refresh_token)
    sendJson(response, 200, { ok: true })
    return true
  }

  return false
}
