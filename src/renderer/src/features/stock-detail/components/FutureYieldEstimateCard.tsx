import { Descriptions, List, Tag, Typography } from 'antd'
import type { FutureYieldEstimateDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function FutureYieldEstimateCard({ estimate }: { estimate: FutureYieldEstimateDto }) {
  return (
    <AppCard>
      <Descriptions title="Future Yield Estimate" column={1}>
        <Descriptions.Item label="Method">
          <Tag color={estimate.method === 'baseline' ? 'blue' : 'gold'}>{estimate.method}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Dividend Per Share">
          {estimate.estimatedDividendPerShare.toFixed(3)}
        </Descriptions.Item>
        <Descriptions.Item label="Estimated Yield">
          {percent.format(estimate.estimatedFutureYield)}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Title level={5}>Calculation Steps</Typography.Title>
      <List
        size="small"
        dataSource={estimate.steps}
        renderItem={(step) => <List.Item>{step}</List.Item>}
      />
    </AppCard>
  )
}
