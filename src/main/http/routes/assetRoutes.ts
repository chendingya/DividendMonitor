import type { ServerResponse } from 'node:http'
import type { AssetCompareRequestDto, AssetQueryDto, AssetSearchRequestDto } from '@shared/contracts/api'
import { compareAssets } from '@main/application/useCases/compareAssets'
import { getAssetDetail } from '@main/application/useCases/getAssetDetail'
import { searchAssets } from '@main/application/useCases/searchAssets'
import { HttpError, sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleAssetRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/asset/search' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('搜索请求体无效。', 400)
    }

    const result = await searchAssets(body as AssetSearchRequestDto)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/asset/detail' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('详情请求体无效。', 400)
    }

    const result = await getAssetDetail(body as AssetQueryDto)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/asset/compare' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('对比请求体无效。', 400)
    }

    const result = await compareAssets(body as AssetCompareRequestDto)
    sendJson(response, 200, result)
    return true
  }

  return false
}
