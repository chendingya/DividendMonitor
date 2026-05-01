import { LOCAL_HTTP_API_ORIGIN } from '@shared/contracts/api'

/** Allowed custom header keys — extend only when a legitimate need arises */
const ALLOWED_CUSTOM_HEADERS = new Set(['X-Local-Nonce'])

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const customHeaders: Record<string, string> = {}
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (ALLOWED_CUSTOM_HEADERS.has(key)) {
        customHeaders[key] = value
      }
    }
  }

  const headers: Record<string, string> = {
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...customHeaders
  }

  const response = await fetch(`${LOCAL_HTTP_API_ORIGIN}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })

  if (response.status === 204) {
    return undefined as T
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message || `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}
