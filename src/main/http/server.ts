import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { LOCAL_HTTP_API_ORIGIN } from '@shared/contracts/api'
import { handleAssetRoute } from '@main/http/routes/assetRoutes'
import { handleCalculationRoute } from '@main/http/routes/calculationRoutes'
import { handlePortfolioRoute } from '@main/http/routes/portfolioRoutes'
import { handleWatchlistRoute } from '@main/http/routes/watchlistRoutes'
import { HttpError, asHttpError, sendJson } from '@main/http/httpErrors'

let httpServer: Server | null = null

function getBaseUrl() {
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
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', LOCAL_HTTP_API_ORIGIN)
  const pathname = url.pathname
  const method = request.method ?? 'GET'
  const body = await readJsonBody(request)

  const handled =
    (await handleAssetRoute({ pathname, method, body, response })) ||
    (await handleWatchlistRoute({ pathname, method, body, response })) ||
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
      resolve()
    })
  })
}

export async function stopLocalHttpServer() {
  if (!httpServer) {
    return
  }

  const server = httpServer
  httpServer = null
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
