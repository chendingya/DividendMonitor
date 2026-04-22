import { Card } from 'antd'
import type { PropsWithChildren, ReactNode } from 'react'

type AppCardProps = PropsWithChildren<{
  title?: ReactNode
  extra?: ReactNode
  className?: string
}>

export function AppCard({ children, title, extra, className }: AppCardProps) {
  return (
    <Card bordered={false} title={title} extra={extra} className={`glass-card ${className ?? ''}`.trim()}>
      {children}
    </Card>
  )
}
