import type { ServerResponse } from 'node:http'
import type { AssetKey, WatchlistAddRequestDto, WatchlistGroupAssetActionDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { addWatchlistAsset } from '@main/application/useCases/addWatchlistAsset'
import { listWatchlist } from '@main/application/useCases/listWatchlist'
import { removeWatchlistAsset } from '@main/application/useCases/removeWatchlistAsset'
import { listWatchlistGroups } from '@main/application/useCases/listWatchlistGroups'
import { createWatchlistGroup } from '@main/application/useCases/createWatchlistGroup'
import { updateWatchlistGroup } from '@main/application/useCases/updateWatchlistGroup'
import { deleteWatchlistGroup } from '@main/application/useCases/deleteWatchlistGroup'
import { addAssetToWatchlistGroup } from '@main/application/useCases/addAssetToWatchlistGroup'
import { removeAssetFromWatchlistGroup } from '@main/application/useCases/removeAssetFromWatchlistGroup'
import { listWatchlistGroupAssets } from '@main/application/useCases/listWatchlistGroupAssets'
import { getAssetGroupIds } from '@main/application/useCases/getAssetGroupIds'
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

  if (pathname === '/api/watchlist/groups' && method === 'GET') {
    const result = await listWatchlistGroups()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/watchlist/groups' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('分组创建请求体无效。', 400)
    }

    const result = await createWatchlistGroup(body as WatchlistGroupUpsertDto)
    sendJson(response, 201, result)
    return true
  }

  if (pathname.startsWith('/api/watchlist/groups/') && method === 'PUT') {
    const id = pathname.slice('/api/watchlist/groups/'.length)
    if (!id || !body || typeof body !== 'object') {
      throw new HttpError('分组更新请求无效。', 400)
    }

    const result = await updateWatchlistGroup(id, body as WatchlistGroupUpsertDto)
    sendJson(response, 200, result)
    return true
  }

  if (pathname.startsWith('/api/watchlist/groups/') && method === 'DELETE') {
    const id = pathname.slice('/api/watchlist/groups/'.length)
    if (!id) {
      throw new HttpError('分组 ID 不能为空。', 400)
    }

    await deleteWatchlistGroup(id)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/watchlist/groups/add-asset' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('加入分组请求体无效。', 400)
    }

    await addAssetToWatchlistGroup(body as WatchlistGroupAssetActionDto)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/watchlist/groups/remove-asset' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('移出分组请求体无效。', 400)
    }

    await removeAssetFromWatchlistGroup(body as WatchlistGroupAssetActionDto)
    sendNoContent(response)
    return true
  }

  if (pathname.startsWith('/api/watchlist/groups/') && pathname.endsWith('/assets') && method === 'GET') {
    const id = pathname.slice('/api/watchlist/groups/'.length, -'/assets'.length)
    if (!id) {
      throw new HttpError('分组 ID 不能为空。', 400)
    }

    const result = await listWatchlistGroupAssets(id)
    sendJson(response, 200, result)
    return true
  }

  if (pathname.startsWith('/api/watchlist/asset-groups/') && method === 'GET') {
    const assetKey = pathname.slice('/api/watchlist/asset-groups/'.length)
    if (!assetKey) {
      throw new HttpError('资产标识不能为空。', 400)
    }

    const result = await getAssetGroupIds(assetKey)
    sendJson(response, 200, result)
    return true
  }

  return false
}
