import { getStockDesktopApi } from '@renderer/services/desktopApi'

export const stockApi = {
  search(keyword: string) {
    return getStockDesktopApi().search(keyword)
  },
  getDetail(symbol: string) {
    return getStockDesktopApi().getDetail(symbol)
  },
  compare(symbols: string[]) {
    return getStockDesktopApi().compare(symbols)
  }
}

