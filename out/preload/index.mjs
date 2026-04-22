import { contextBridge, ipcRenderer } from "electron";
const api = {
  stock: {
    search: (keyword) => ipcRenderer.invoke("stock:search", keyword),
    getDetail: (symbol) => ipcRenderer.invoke("stock:get-detail", symbol),
    compare: (symbols) => ipcRenderer.invoke("stock:compare", symbols)
  },
  watchlist: {
    list: () => ipcRenderer.invoke("watchlist:list")
  },
  calculation: {
    getHistoricalYield: (symbol) => ipcRenderer.invoke("calculation:historical-yield", symbol),
    estimateFutureYield: (symbol) => ipcRenderer.invoke("calculation:estimate-future-yield", symbol),
    runDividendReinvestmentBacktest: (symbol, buyDate) => ipcRenderer.invoke("calculation:run-dividend-reinvestment-backtest", symbol, buyDate)
  }
};
contextBridge.exposeInMainWorld("dividendMonitor", api);
