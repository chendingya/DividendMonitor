import { Layout, Typography } from 'antd'
import { StockDetailPage } from '@renderer/pages/StockDetailPage'

export default function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          DividendMonitor
        </Typography.Title>
      </Layout.Header>
      <StockDetailPage />
    </Layout>
  )
}
