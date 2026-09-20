import React from 'react'
import ReactDOM from 'react-dom/client'
import 'antd/dist/reset.css'
import '@renderer/styles/theme.css'
import App from '@renderer/App'
import { initializeRuntime } from '@renderer/services/desktopApi'

const root = document.getElementById('root') as HTMLElement
void initializeRuntime().then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}).catch((error: unknown) => {
  root.textContent = `应用启动失败：${error instanceof Error ? error.message : String(error)}`
})
