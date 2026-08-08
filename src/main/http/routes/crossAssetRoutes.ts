import type { ServerResponse } from 'node:http'
import { getCrossAssetComparison } from '@main/application/useCases/getCrossAssetComparison'
import { sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  response: ServerResponse
}

export async function handleCrossAssetRoute({ pathname, method, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/cross-asset/comparison' && method === 'GET') {
    const result = await getCrossAssetComparison()
    sendJson(response, 200, result)
    return true
  }

  return false
}
