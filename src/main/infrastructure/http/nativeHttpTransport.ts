import { CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core'
import { AxiosHeaders, type RawAxiosHeaders } from 'axios'
import type { HttpGetTransport } from './httpClient'

/** 在 Android 原生网络层请求，绕开 WebView CORS；不全局改写 fetch。 */
export function createNativeHttpTransport(request: (options: HttpOptions) => Promise<HttpResponse> = CapacitorHttp.get): HttpGetTransport {
  return async (url, responseType, config) => {
    const headers = AxiosHeaders.from({
      Accept: 'application/json,text/plain,*/*',
      'User-Agent': 'Mozilla/5.0 DividendMonitor/0.3.0',
      ...AxiosHeaders.from(config.headers as RawAxiosHeaders | AxiosHeaders | undefined).toJSON()
    }).toJSON(true) as Record<string, string>
    const response = await request({
      url, headers, responseType,
      readTimeout: config.timeout ?? 10000,
      connectTimeout: config.timeout ?? 10000
    })
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} for ${url}`)
    if (responseType === 'arraybuffer') {
      if (typeof response.data !== 'string') throw new Error('原生 HTTP 返回的二进制数据格式无效')
      return Uint8Array.from(atob(response.data), (character) => character.charCodeAt(0)).buffer
    }
    // Capacitor 会按响应 Content-Type 自动解析 JSON，即使调用方请求的是文本。
    if (responseType === 'text' && typeof response.data !== 'string') return JSON.stringify(response.data)
    return response.data
  }
}
