import { List, Typography } from 'antd'
import type { HistoricalYieldPointDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function DividendYieldChart({ items }: { items: HistoricalYieldPointDto[] }) {
  return (
    <AppCard>
      <Typography.Title level={5}>Natural Year Dividend Yield</Typography.Title>
      <List
        dataSource={items}
        renderItem={(item) => (
          <List.Item>
            {item.year}: {percent.format(item.yield)} / {item.events} events
          </List.Item>
        )}
      />
    </AppCard>
  )
}
