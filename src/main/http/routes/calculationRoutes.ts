import type { ServerResponse } from 'node:http'
import type { AssetBacktestRequestDto, AssetQueryDto } from '@shared/contracts/api'
import type { BacktestResultDto } from '@shared/contracts/api'
import { estimateFutureYieldForAsset } from '@main/application/useCases/estimateFutureYieldForAsset'
import { getHistoricalYieldForAsset } from '@main/application/useCases/getHistoricalYieldForAsset'
import { runDividendReinvestmentBacktestForAsset } from '@main/application/useCases/runDividendReinvestmentBacktestForAsset'
import { listBacktestHistory, saveBacktestHistory, deleteBacktestHistory } from '@main/application/useCases/backtestHistoryUseCases'
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

  // Backtest history
  if (pathname === '/api/backtest/history' && method === 'GET') {
    const result = listBacktestHistory()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/backtest/history' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('回测保存请求体无效。', 400)
    }
    const { result, name, dcaConfig } = body as { result: BacktestResultDto; name?: string; dcaConfig?: string }
    const saved = saveBacktestHistory(result, name, dcaConfig)
    sendJson(response, 200, saved)
    return true
  }

  if (pathname === '/api/backtest/history' && method === 'DELETE') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('删除请求体无效。', 400)
    }
    const { id } = body as { id: string }
    const deleted = deleteBacktestHistory(id)
    sendJson(response, 200, { deleted })
    return true
  }

  return false
}
