import { Layout } from 'antd'
import { StockDetailContainer } from '@renderer/containers/StockDetailContainer'

export function StockDetailPage() {
  return (
    <Layout.Content style={{ padding: 24 }}>
      <StockDetailContainer symbol="600519" />
    </Layout.Content>
  )
}
