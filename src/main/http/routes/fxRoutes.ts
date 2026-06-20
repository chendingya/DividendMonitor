import type { ServerResponse } from 'node:http'
import { getUsdCnyRate } from '@main/application/useCases/getFxRateUseCase'
import { sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleFxRoute({ pathname, method, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/fx/usd-cny-rate' && method === 'GET') {
    try {
      const rate = await getUsdCnyRate()
      sendJson(response, 200, { rate })
    } catch {
      sendJson(response, 200, { rate: 7.2 })
    }
    return true
  }

  return false
}
