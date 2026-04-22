import { ConfigProvider } from 'antd'
import { HashRouter } from 'react-router-dom'
import { AppShell } from '@renderer/layouts/AppShell'
import { AppRouter } from '@renderer/router/AppRouter'

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
        <AppShell>
          <AppRouter />
        </AppShell>
      </HashRouter>
    </ConfigProvider>
  )
}

