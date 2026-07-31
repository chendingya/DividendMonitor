import type { ServerResponse } from 'node:http'
import { listDividendHistory, type DividendHistoryRequest } from '@main/application/useCases/listDividendHistory'
import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'
import { getDividendForecast } from '@main/application/useCases/getDividendForecast'
import { sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleDividendRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/dividend/history' && method === 'POST') {
    const request = (body ?? undefined) as DividendHistoryRequest | undefined
    const result = await listDividendHistory(request)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/dividend/history' && method === 'GET') {
    const result = await listDividendHistory()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/dividend/upcoming' && (method === 'POST' || method === 'GET')) {
    const result = await listUpcomingDividends()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/dividend/forecast' && (method === 'POST' || method === 'GET')) {
    const bodyObj = (body ?? {}) as { year?: number }
    const result = await getDividendForecast(bodyObj.year)
    sendJson(response, 200, result)
    return true
  }

  return false
}
