import { contextBridge, ipcRenderer } from 'electron'
import type { DividendMonitorApi } from '@shared/contracts/api'

const api: DividendMonitorApi = {
  stock: {
    search: (keyword) => ipcRenderer.invoke('stock:search', keyword),
    getDetail: (symbol) => ipcRenderer.invoke('stock:get-detail', symbol)
  }
}

contextBridge.exposeInMainWorld('dividendMonitor', api)
