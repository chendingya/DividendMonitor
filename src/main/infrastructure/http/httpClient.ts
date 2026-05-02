import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import https from 'node:https'

// getDetail() fires requests serially with staggered delays, so the socket
// pool is no longer the bottleneck. Keep a moderate pool for UI-initiated
// parallel requests.
EventEmitter.defaultMaxListeners = 50
http.globalAgent.maxSockets = 16
https.globalAgent.maxSockets = 16

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
    const response = await httpClient.get<T>(url, applyRefererGuard(config, url))
    return response.data
  } catch (error) {
    throw toHttpError(error, url)
  }
}

export async function getText(url: string, config?: AxiosRequestConfig): Promise<string> {
  try {
    const response = await httpClient.get<string>(url, {
      responseType: 'text',
      ...applyRefererGuard(config, url)
    })
    return response.data
  } catch (error) {
    throw toHttpError(error, url)
  }
}
