import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

export type HttpGetTransport = (url: string, responseType: 'json' | 'text' | 'arraybuffer', config: AxiosRequestConfig) => Promise<unknown>
let platformTransport: HttpGetTransport | undefined

export function setHttpGetTransport(transport: HttpGetTransport | undefined): void {
  platformTransport = transport
}

const httpClient = axios.create({
  timeout: 10000,
  headers: {
    Accept: 'application/json,text/plain,*/*',
    'User-Agent': 'Mozilla/5.0 DividendMonitor/0.1.0'
  }
})

// Some eastmoney APIs (push2.eastmoney.com) reject requests without a Referer.
// Attach one automatically when the URL matches known eastmoney push endpoints.
function applyRefererGuard(config: AxiosRequestConfig | undefined, url: string): AxiosRequestConfig {
  if (/^https:\/\/push2(his)?\.eastmoney\.com\//.test(url)) {
    return {
      ...config,
      headers: {
        Referer: 'https://quote.eastmoney.com/',
        ...config?.headers
      }
    }
  }
  return config ?? {}
}

function toHttpError(error: unknown, url: string): Error {
  if (error instanceof AxiosError) {
    const status = error.response?.status
    if (status != null) {
      return new Error(`HTTP ${status} for ${url}`)
    }
    // No response received — include the underlying cause for diagnosis
    const code = error.code ?? ''
    const cause = error.cause instanceof Error ? error.cause.message : ''
    const detail = [code, cause].filter(Boolean).join(' - ') || 'no response'
    return new Error(`NETWORK (${detail}) for ${url}`)
  }

  return error instanceof Error ? error : new Error(`Unknown request error for ${url}`)
}

export async function getJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  try {
    if (platformTransport) return await platformTransport(url, 'json', applyRefererGuard(config, url)) as T
    const response = await httpClient.get<T>(url, applyRefererGuard(config, url))
    return response.data
  } catch (error) {
    throw toHttpError(error, url)
  }
}

export async function getText(url: string, config?: AxiosRequestConfig): Promise<string> {
  try {
    if (platformTransport) return await platformTransport(url, 'text', applyRefererGuard(config, url)) as string
    const response = await httpClient.get<string>(url, {
      responseType: 'text',
      ...applyRefererGuard(config, url)
    })
    return response.data
  } catch (error) {
    throw toHttpError(error, url)
  }
}

export async function getArrayBuffer(url: string, config?: AxiosRequestConfig): Promise<ArrayBuffer> {
  try {
    if (platformTransport) return await platformTransport(url, 'arraybuffer', applyRefererGuard(config, url)) as ArrayBuffer
    const response = await httpClient.get<ArrayBuffer>(url, { ...applyRefererGuard(config, url), responseType: 'arraybuffer' })
    return response.data
  } catch (error) { throw toHttpError(error, url) }
}
