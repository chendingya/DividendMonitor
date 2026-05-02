import type { ServerResponse } from 'node:http'
import { getIndustryAnalysis, getIndustryDistribution, getIndustryBenchmark } from '@main/application/useCases/getIndustryAnalysis'
import { HttpError, sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleIndustryRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/industry/analysis' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('行业分析请求体无效。', 400)
    }
    const { industryName, assetKeys } = body as { industryName?: string; assetKeys?: string[] }
    const result = await getIndustryAnalysis(industryName, assetKeys)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/industry/distribution' && method === 'GET') {
    const result = await getIndustryDistribution()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/industry/benchmark' && method === 'POST') {
    if (!body || typeof body !== 'object' || !('industryName' in body)) {
      throw new HttpError('行业名称不能为空', 400)
    }
    const { industryName } = body as { industryName: string }
    const result = await getIndustryBenchmark(industryName)
    sendJson(response, 200, result)
    return true
  }

  return false
}
