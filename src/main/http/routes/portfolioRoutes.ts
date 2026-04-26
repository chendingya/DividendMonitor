import type { ServerResponse } from 'node:http'
import type { AssetQueryDto, PortfolioPositionReplaceByAssetDto, PortfolioPositionUpsertDto } from '@shared/contracts/api'
import { listPortfolioPositions } from '@main/application/useCases/listPortfolioPositions'
import { removePortfolioPosition } from '@main/application/useCases/removePortfolioPosition'
import { removePortfolioPositionsByAsset } from '@main/application/useCases/removePortfolioPositionsByAsset'
import { replacePortfolioPositionsByAsset } from '@main/application/useCases/replacePortfolioPositionsByAsset'
import { upsertPortfolioPosition } from '@main/application/useCases/upsertPortfolioPosition'
import { HttpError, sendJson, sendNoContent } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handlePortfolioRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/portfolio' && method === 'GET') {
    const result = await listPortfolioPositions()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/portfolio/upsert' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('持仓写入请求体无效。', 400)
    }

    await upsertPortfolioPosition(body as PortfolioPositionUpsertDto)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/portfolio/remove' && method === 'POST') {
    if (!body || typeof body !== 'object' || typeof (body as { id?: unknown }).id !== 'string') {
      throw new HttpError('持仓删除请求体无效。', 400)
    }

    await removePortfolioPosition((body as { id: string }).id)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/portfolio/remove-by-asset' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('按资产删除持仓请求体无效。', 400)
    }

    await removePortfolioPositionsByAsset(body as AssetQueryDto)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/portfolio/replace-by-asset' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('按资产替换持仓请求体无效。', 400)
    }

    await replacePortfolioPositionsByAsset(body as PortfolioPositionReplaceByAssetDto)
    sendNoContent(response)
    return true
  }

  return false
}
