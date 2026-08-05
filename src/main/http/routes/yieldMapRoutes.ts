import type { ServerResponse } from 'node:http'
import { getMarketYieldMap, refreshMarketYieldMap } from '@main/application/useCases/getMarketYieldMap'
import { sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleYieldMapRoute({ pathname, method, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/yield-map' && (method === 'GET' || method === 'POST')) {
    const result = await getMarketYieldMap()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/yield-map/refresh' && (method === 'GET' || method === 'POST')) {
    const result = await refreshMarketYieldMap()
    sendJson(response, 200, result)
    return true
  }

  return false
}
