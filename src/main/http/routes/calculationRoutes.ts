import type { ServerResponse } from 'node:http'
import type { AssetBacktestRequestDto, AssetQueryDto } from '@shared/contracts/api'
import { estimateFutureYieldForAsset } from '@main/application/useCases/estimateFutureYieldForAsset'
import { getHistoricalYieldForAsset } from '@main/application/useCases/getHistoricalYieldForAsset'
import { runDividendReinvestmentBacktestForAsset } from '@main/application/useCases/runDividendReinvestmentBacktestForAsset'
import { HttpError, sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleCalculationRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/calculation/historical-yield' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('历史股息率请求体无效。', 400)
    }

    const result = await getHistoricalYieldForAsset(body as AssetQueryDto)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/calculation/estimate-future-yield' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('未来股息率请求体无效。', 400)
    }

    const result = await estimateFutureYieldForAsset(body as AssetQueryDto)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/calculation/backtest' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('回测请求体无效。', 400)
    }

    const result = await runDividendReinvestmentBacktestForAsset(body as AssetBacktestRequestDto)
    sendJson(response, 200, result)
    return true
  }

  return false
}
