import { getWatchlistDesktopApi } from '@renderer/services/desktopApi'

export const watchlistApi = {
  list() {
    return getWatchlistDesktopApi().list()
  },
  add(symbol: string) {
    return getWatchlistDesktopApi().add(symbol)
  },
  remove(symbol: string) {
    return getWatchlistDesktopApi().remove(symbol)
  }
}

