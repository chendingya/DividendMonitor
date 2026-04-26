import { contextBridge, ipcRenderer } from "electron";
const api = {
  asset: {
    search: (request) => ipcRenderer.invoke("asset:search", request),
    getDetail: (request) => ipcRenderer.invoke("asset:get-detail", request),
    compare: (request) => ipcRenderer.invoke("asset:compare", request)
  },
  stock: {
    search: (keyword) => ipcRenderer.invoke("stock:search", keyword),
    getDetail: (symbol) => ipcRenderer.invoke("stock:get-detail", symbol),
    compare: (symbols) => ipcRenderer.invoke("stock:compare", symbols)
  },
  watchlist: {
    list: () => ipcRenderer.invoke("watchlist:list"),
    add: (symbol) => ipcRenderer.invoke("watchlist:add", symbol),
    remove: (symbol) => ipcRenderer.invoke("watchlist:remove", symbol),
    addAsset: (request) => ipcRenderer.invoke("watchlist:add-asset", request),
    removeAsset: (assetKey) => ipcRenderer.invoke("watchlist:remove-asset", assetKey)
  },
  calculation: {
    getHistoricalYield: (symbol) => ipcRenderer.invoke("calculation:historical-yield", symbol),
    estimateFutureYield: (symbol) => ipcRenderer.invoke("calculation:estimate-future-yield", symbol),
    runDividendReinvestmentBacktest: (symbol, buyDate) => ipcRenderer.invoke("calculation:run-dividend-reinvestment-backtest", symbol, buyDate),
    getHistoricalYieldForAsset: (request) => ipcRenderer.invoke("calculation:historical-yield-for-asset", request),
    estimateFutureYieldForAsset: (request) => ipcRenderer.invoke("calculation:estimate-future-yield-for-asset", request),
    runDividendReinvestmentBacktestForAsset: (request) => ipcRenderer.invoke("calculation:run-dividend-reinvestment-backtest-for-asset", request)
  },
  portfolio: {
    list: () => ipcRenderer.invoke("portfolio:list"),
    upsert: (request) => ipcRenderer.invoke("portfolio:upsert", request),
    remove: (id) => ipcRenderer.invoke("portfolio:remove", id),
    removeByAsset: (request) => ipcRenderer.invoke("portfolio:remove-by-asset", request),
    replaceByAsset: (request) => ipcRenderer.invoke("portfolio:replace-by-asset", request)
  }
};
contextBridge.exposeInMainWorld("dividendMonitor", api);
