import { ConfigProvider } from 'antd'
import { HashRouter, useLocation } from 'react-router-dom'
import { AuthProvider } from '@renderer/contexts/AuthContext'
import { AppShell } from '@renderer/layouts/AppShell'
import { AppRouter } from '@renderer/router/AppRouter'

function AppLayout() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  if (isLoginPage) {
    return <AppRouter />
  }

  return (
    <AppShell>
      <AppRouter />
    </AppShell>
  )
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#0052d0',
          colorBgBase: '#f5f7f9',
          colorText: '#2c2f31',
          colorTextSecondary: '#66707a',
          colorBorderSecondary: 'rgba(171,173,175,0.18)',
          borderRadius: 16,
          fontFamily:
            'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
        },
        components: {
          Card: {
            bodyPadding: 24
          },
          Table: {
            headerBg: 'transparent',
            rowHoverBg: 'rgba(238,241,243,0.68)'
          },
          Button: {
            borderRadius: 16
          }
        }
      }}
    >
      <HashRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </HashRouter>
    </ConfigProvider>
  )
}

