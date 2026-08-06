import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { LOCAL_HTTP_API_ORIGIN } from '@shared/contracts/api'
import { validateNonce } from '@main/security/localNonce'
import { handleAssetRoute } from '@main/http/routes/assetRoutes'
import { handleAuthRoute } from '@main/http/routes/authRoutes'
import { handleCalculationRoute } from '@main/http/routes/calculationRoutes'
import { handleDividendRoute } from '@main/http/routes/dividendRoutes'
import { handleFxRoute } from '@main/http/routes/fxRoutes'
import { handleHousingRoute } from '@main/http/routes/housingRoutes'
import { handleIndustryRoute } from '@main/http/routes/industryRoutes'
import { handlePortfolioRoute } from '@main/http/routes/portfolioRoutes'
import { handleSecurityRoute } from '@main/http/routes/securityRoutes'
import { handleSettingsRoute } from '@main/http/routes/settingsRoutes'
import { handleSyncRoute } from '@main/http/routes/syncRoutes'
import { handleWatchlistRoute } from '@main/http/routes/watchlistRoutes'
import { handleYieldMapRoute } from '@main/http/routes/yieldMapRoutes'
import { HttpError, asHttpError, sendJson } from '@main/http/httpErrors'
import { getSecurityHeaders } from '@main/security/contentSecurityPolicy'

let httpServer: Server | null = null
let currentBaseUrl: URL | null = null

/** 生产模式固定白名单：与历史行为一致（打包版不使用端口退避） */
const FIXED_ALLOWED_ORIGINS = [
  'http://127.0.0.1:3210',
  'http://localhost:3210',
  'http://127.0.0.1:8192',
  'http://localhost:8192'
]

/**
 * 动态计算 CORS 白名单：仅放行本地 HTTP API 自身（含 127.0.0.1/localhost
 * 两种 host 形式）、dev 模式下前端 dev server 的 origin（端口退避后可能
 * 不再是 8192）与 LOCAL_HTTP_API_CORS_ORIGINS 显式配置的公网 origin。
 */
function getConfiguredCorsOrigins(): string[] {
  return (process.env['LOCAL_HTTP_API_CORS_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function getAllowedOrigins(): string[] {
  const baseUrl = getBaseUrl()
  const origins = new Set<string>([
    `http://127.0.0.1:${baseUrl.port}`,
    `http://localhost:${baseUrl.port}`
  ])

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    origins.add(new URL(rendererUrl).origin)
  } else {
    // 生产（非 dev）模式：回退到固定 3210/8192 白名单
    for (const origin of FIXED_ALLOWED_ORIGINS) {
      origins.add(origin)
    }
  }

  for (const origin of getConfiguredCorsOrigins()) {
    origins.add(origin)
  }

  return [...origins]
}

/** Host 白名单：默认只能回环地址；LOCAL_HTTP_API_HOSTS 可扩展公网域名（逗号分隔） */
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost'])

function getConfiguredHostnames(): Set<string> {
  const hosts = (process.env['LOCAL_HTTP_API_HOSTS'] ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...ALLOWED_HOSTNAMES, ...hosts])
}

/**
 * 无需 nonce 校验的路径：
 * - /api/security/nonce 是非ce 分发端点本身
 * - /auth/callback 是 Supabase 邮件确认回调，由外部浏览器直接访问（仅返回静态 HTML）
 */
const NONCE_EXEMPT_PATHS = new Set(['/api/security/nonce', '/auth/callback'])

function requireValidNonce(request: IncomingMessage): void {
  const nonce = request.headers['x-local-nonce']
  const nonceValue = Array.isArray(nonce) ? nonce[0] : nonce
  if (!validateNonce(nonceValue)) {
    throw new HttpError('缺少或无效的本地认证令牌。', 403)
  }
}

function isAllowedHost(hostname: string): boolean {
  return getConfiguredHostnames().has(hostname)
}

/** 从请求 Host 头解析 hostname（DNS rebinding 检查对象）；缺失时回退到监听基址 */
function resolveRequestHostname(request: IncomingMessage, baseUrl: URL): string {
  const hostHeader = request.headers.host
  if (!hostHeader) return baseUrl.hostname
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function getBaseUrl() {
  const origin = process.env['LOCAL_HTTP_API_ORIGIN']?.trim()
  if (origin) {
    try {
      const parsed = new URL(origin)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed
      }
    } catch {
      // 非法 origin 环境变量回退到端口/默认逻辑
    }
  }

  const port = process.env['LOCAL_HTTP_API_PORT']?.trim()
  if (port && /^\d+$/.test(port)) {
    return new URL(`http://127.0.0.1:${port}`)
  }
  return new URL(LOCAL_HTTP_API_ORIGIN)
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined
  }

  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return undefined
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    return undefined
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError('请求体不是合法 JSON。', 400)
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  // Apply security headers to all responses
  const isDevelopment = Boolean(process.env['ELECTRON_RENDERER_URL'])
  const securityHeaders = getSecurityHeaders(isDevelopment, getBaseUrl().origin)
  for (const [key, value] of Object.entries(securityHeaders)) {
    if (value) {
      response.setHeader(key, value)
    }
  }

  const url = new URL(request.url ?? '/', getBaseUrl())
  const pathname = url.pathname
  const method = request.method ?? 'GET'

  // Reject non-whitelisted Host headers to mitigate DNS rebinding attacks.
  // 检查对象为请求 Host 头（而非监听地址），公网部署可用 LOCAL_HTTP_API_HOSTS 扩展。
  if (!isAllowedHost(resolveRequestHostname(request, getBaseUrl()))) {
    throw new HttpError('非法请求来源。', 403)
  }

  // Origin must match the strict local whitelist when present. Requests from
  // arbitrary web pages (any origin, any local port) are rejected outright.
  const origin = request.headers.origin
  if (origin && !getAllowedOrigins().includes(origin)) {
    throw new HttpError('跨域请求被拒绝。', 403)
  }
  response.setHeader('Access-Control-Allow-Origin', origin ?? getBaseUrl().origin)
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Local-Nonce')

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  // Every API call must carry a valid local nonce header — except the nonce
  // dispenser itself and the external email-confirmation callback. This blocks
  // cross-origin form submissions and non-browser callers from mutating data.
  if (!NONCE_EXEMPT_PATHS.has(pathname)) {
    requireValidNonce(request)
  }

  const body = await readJsonBody(request)

  const handled =
    (await handleAuthRoute({ pathname, method, body, response, headers: request.headers })) ||
    (await handleAssetRoute({ pathname, method, body, response })) ||
    (await handleDividendRoute({ pathname, method, body, response })) ||
    (await handleFxRoute({ pathname, method, body, response })) ||
    (await handleHousingRoute({ pathname, method, body, response })) ||
    (await handleYieldMapRoute({ pathname, method, body, response })) ||
    (await handleIndustryRoute({ pathname, method, body, response })) ||
    (await handleSettingsRoute({ pathname, method, body, response })) ||
    (await handleWatchlistRoute({ pathname, method, body, response })) ||
    (await handleSecurityRoute({ pathname, method, body, response, headers: request.headers })) ||
    (await handleSyncRoute({ pathname, method, body, response, headers: request.headers })) ||
    (await handleCalculationRoute({ pathname, method, body, response })) ||
    (await handlePortfolioRoute({ pathname, method, body, response }))

  if (!handled) {
    throw new HttpError(`未找到接口：${method} ${pathname}`, 404)
  }
}

export async function startLocalHttpServer() {
  if (httpServer) {
    return
  }

  const baseUrl = getBaseUrl()
  const host = baseUrl.hostname
  const port = Number(baseUrl.port || 80)

  httpServer = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      const httpError = asHttpError(error)
      sendJson(response, httpError.statusCode, {
        error: {
          message: httpError.message
        }
      })
    })
  })

  await new Promise<void>((resolve, reject) => {
    httpServer!.once('error', reject)
    httpServer!.listen(port, host, () => {
      httpServer?.off('error', reject)
      const address = httpServer!.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      // 端口 0 时记录实际绑定的随机端口，供 getLocalApiBaseUrl 使用
      currentBaseUrl = new URL(`http://${host}:${actualPort}`)
      console.log(`[http-api] listening on http://${host}:${actualPort}`)
      resolve()
    })
  })
}

/**
 * 当前 HTTP API 的可访问基地址（origin）。
 * 端口 0（随机空闲端口）场景下返回实际绑定端口；未启动时按配置计算。
 */
export function getLocalApiBaseUrl(): string {
  if (currentBaseUrl) {
    return currentBaseUrl.origin
  }
  return getBaseUrl().origin
}

export async function stopLocalHttpServer() {
  if (!httpServer) {
    return
  }

  const server = httpServer
  httpServer = null
  currentBaseUrl = null
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
