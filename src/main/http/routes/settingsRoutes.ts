import type { ServerResponse } from 'node:http'
import { getSettings } from '@main/application/useCases/getSettingsUseCase'
import { updateSettings, resetSettings } from '@main/application/useCases/updateSettingsUseCase'
import { HttpError, sendJson } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleSettingsRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/settings' && method === 'GET') {
    const result = getSettings()
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('设置请求体无效。', 400)
    }
    const result = updateSettings(body as Record<string, unknown>)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/settings' && method === 'DELETE') {
    const result = resetSettings()
    sendJson(response, 200, result)
    return true
  }

  return false
}
