import React from 'react'
import ReactDOM from 'react-dom/client'
import 'antd/dist/reset.css'
import '@renderer/styles/theme.css'
import App from '@renderer/App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
