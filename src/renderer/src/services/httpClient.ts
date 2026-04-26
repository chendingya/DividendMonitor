import { LOCAL_HTTP_API_ORIGIN } from '@shared/contracts/api'

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${LOCAL_HTTP_API_ORIGIN}${path}`, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
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
