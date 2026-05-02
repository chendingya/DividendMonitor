import axios from 'axios'
import { getJson, getText } from '@main/infrastructure/http/httpClient'
import type { EndpointDefinition } from '@main/infrastructure/dataSources/types/sourceTypes'

const BACKOFF_BASE_MS = 1500
const MAX_BACKOFF_MS = 8000

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toUpperCase()
  // ECONNRESET / ETIMEDOUT / ECONNREFUSED / ENOTFOUND / socket hang up
  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|SOCKET.*HANG/i.test(msg)
}

async function delayMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export class HttpTransport {
  async send<TInput, TRaw>(endpoint: EndpointDefinition<TInput, TRaw, unknown>, input: TInput): Promise<TRaw> {
    const url = endpoint.buildUrl(input)
    const config = {
      timeout: endpoint.timeoutMs,
      headers: endpoint.headers
    }

    const attemptSend = async (): Promise<TRaw> => {
      if (endpoint.parser === 'gbk') {
        const response = await axios.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          ...config
        })
        const decoder = new TextDecoder('gbk')
        return decoder.decode(response.data) as TRaw
      }

      if (endpoint.parser === 'text') {
        return await getText(url, config) as TRaw
      }

      return await getJson<TRaw>(url, config)
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await attemptSend()
      } catch (error) {
        if (attempt < 1 && isTransientError(error)) {
          const backoff = Math.min(BACKOFF_BASE_MS * (attempt + 1) + Math.random() * 500, MAX_BACKOFF_MS)
          await delayMs(backoff)
          continue
        }
        throw error
      }
    }

    throw new Error(`Transport exhausted for ${url}`)
  }
}
