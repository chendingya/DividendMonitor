import type { ServerResponse } from 'node:http'
import type { MortgageRequestDto, UserHousingDataUpsertDto } from '@shared/contracts/api'
import { listHousingCities } from '@main/application/useCases/listHousingCities'
import { getHousingCityDetail } from '@main/application/useCases/getHousingCityDetail'
import { watchHousingCity, unwatchHousingCity } from '@main/application/useCases/toggleHousingWatchlist'
import { updateHousingUserData } from '@main/application/useCases/updateHousingUserData'
import { calculateMortgageUseCase } from '@main/application/useCases/calculateMortgage'
import { HttpError, sendJson, sendNoContent } from '@main/http/httpErrors'

type RouteContext = {
  pathname: string
  method: string
  body: unknown
  response: ServerResponse
}

export async function handleHousingRoute({ pathname, method, body, response }: RouteContext): Promise<boolean> {
  if (pathname === '/api/housing/cities' && method === 'GET') {
    const result = await listHousingCities()
    sendJson(response, 200, result)
    return true
  }

  if (pathname.startsWith('/api/housing/cities/') && method === 'GET') {
    const city = decodeURIComponent(pathname.slice('/api/housing/cities/'.length))
    if (!city) {
      throw new HttpError('城市不能为空。', 400)
    }
    const result = await getHousingCityDetail(city)
    sendJson(response, 200, result)
    return true
  }

  if (pathname === '/api/housing/watch' && method === 'POST') {
    const city = (body as { city?: unknown } | undefined)?.city
    if (typeof city !== 'string' || !city) {
      throw new HttpError('城市不能为空。', 400)
    }
    watchHousingCity(city)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/housing/unwatch' && method === 'POST') {
    const city = (body as { city?: unknown } | undefined)?.city
    if (typeof city !== 'string' || !city) {
      throw new HttpError('城市不能为空。', 400)
    }
    unwatchHousingCity(city)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/housing/user-data' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('用户数据请求体无效。', 400)
    }
    updateHousingUserData(body as UserHousingDataUpsertDto)
    sendNoContent(response)
    return true
  }

  if (pathname === '/api/housing/mortgage' && method === 'POST') {
    if (!body || typeof body !== 'object') {
      throw new HttpError('房贷计算请求体无效。', 400)
    }
    const result = calculateMortgageUseCase(body as MortgageRequestDto)
    sendJson(response, 200, result)
    return true
  }

  return false
}
