import { Alert, Col, Row, Skeleton, Typography } from 'antd'
import { useStockDetail } from '@renderer/hooks/useStockDetail'
import { DividendYieldChart } from '@renderer/features/stock-detail/components/DividendYieldChart'
import { FutureYieldEstimateCard } from '@renderer/features/stock-detail/components/FutureYieldEstimateCard'
import { AppCard } from '@renderer/components/app/AppCard'

export function StockDetailContainer({ symbol }: { symbol: string }) {
  const { data, loading, error } = useStockDetail(symbol)

  if (loading) {
    return <Skeleton active paragraph={{ rows: 8 }} />
  }

  if (error || !data) {
    return <Alert type="error" message={error ?? 'Stock detail not found'} />
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <AppCard>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            {data.name} ({data.symbol})
          </Typography.Title>
          <Typography.Text type="secondary">{data.industry ?? 'Unknown Industry'} / A Share</Typography.Text>
        </AppCard>
      </Col>
      <Col xs={24} xl={12}>
        <DividendYieldChart items={data.yearlyYields} />
      </Col>
      <Col xs={24} xl={12}>
        <FutureYieldEstimateCard estimate={data.futureYieldEstimate} />
      </Col>
    </Row>
  )
}
