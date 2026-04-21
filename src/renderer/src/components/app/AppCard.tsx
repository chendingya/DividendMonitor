import { Card } from 'antd'
import type { PropsWithChildren } from 'react'

export function AppCard({ children }: PropsWithChildren) {
  return <Card bordered={false}>{children}</Card>
}
