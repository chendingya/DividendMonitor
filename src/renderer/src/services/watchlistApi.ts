import { getWatchlistDesktopApi } from '@renderer/services/desktopApi'

export const watchlistApi = {
  list() {
    return getWatchlistDesktopApi().list()
  }
}

