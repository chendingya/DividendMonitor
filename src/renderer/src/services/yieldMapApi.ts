import type { MarketYieldMapDto } from '@shared/contracts/api'
import { getYieldMapDesktopApi } from '@renderer/services/desktopApi'

const TTL_MS = 5 * 60 * 1000

const api = getYieldMapDesktopApi()

let cached: MarketYieldMapDto | null = null
let cachedAt = 0

export const yieldMapApi = {
  async get(): Promise<MarketYieldMapDto> {
    const now = Date.now()
    if (cached && now - cachedAt < TTL_MS) {
      return cached
    }
    const data = await api.get()
    cached = data
    cachedAt = now
    return data
  },

  async refresh(): Promise<MarketYieldMapDto> {
    const data = await api.refresh()
    cached = data
    cachedAt = Date.now()
    return data
  }
}
