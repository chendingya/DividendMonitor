import type { ServerResponse } from 'node:http'
import type { AssetKey, WatchlistAddRequestDto } from '@shared/contracts/api'
import { addWatchlistAsset } from '@main/application/useCases/addWatchlistAsset'
import { listWatchlist } from '@main/application/useCases/listWatchlist'
import { removeWatchlistAsset } from '@main/application/useCases/removeWatchlistAsset'
import { HttpError, sendJson, sendNoContent } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleWatchlistRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/watchlist' && method === 'GET') {
    const result = await listWatchlist()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/watchlist/add-asset' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('自选新增请求体无效。', 400)
    }

    await addWatchlistAsset(body as WatchlistAddRequestDto)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/watchlist/remove-asset' && method === 'POST') {
    if (!body || typeof body !== 'object' || typeof (body as { assetKey?: unknown }).assetKey !== 'string') {
      throw new HttpError('自选移除请求体无效。', 400)
    }

    await removeWatchlistAsset((body as { assetKey: AssetKey }).assetKey)
    sendNoContent(response)
    return true
  }

  return false
}
