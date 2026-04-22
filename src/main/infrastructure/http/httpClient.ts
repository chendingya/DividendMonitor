import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

const httpClient = axios.create({
  timeout: 10000,
  headers: {
    Accept: 'application/json,text/plain,*/*',
    'User-Agent': 'DividendMonitor/0.1.0'
  }
})

function toHttpError(error: unknown, url: string): Error {
  if (error instanceof AxiosError) {
    const status = error.response?.status
    const statusPart = status == null ? 'NETWORK' : `HTTP ${status}`
    return new Error(`${statusPart} for ${url}`)
  }

  return error instanceof Error ? error : new Error(`Unknown request error for ${url}`)
}

export async function getJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await httpClient.get<T>(url, config)
    return response.data
  } catch (error) {
    throw toHttpError(error, url)
  }
}

export async function getText(url: string, config?: AxiosRequestConfig): Promise<string> {
  try {
    const response = await httpClient.get<string>(url, {
      responseType: 'text',
      ...config
    })
    return response.data
  } catch (error) {
    throw toHttpError(error, url)
  }
}
