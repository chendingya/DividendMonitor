export const stockApi = {
  search(keyword: string) {
    return window.dividendMonitor.stock.search(keyword)
  },
  getDetail(symbol: string) {
    return window.dividendMonitor.stock.getDetail(symbol)
  }
}
