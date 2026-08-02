import type { ReactNode } from 'react'
import { Alert, Skeleton } from 'antd'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'

type PageStateProps = {
  loading: boolean
  error?: string | null
  empty?: boolean
  skeletonRows?: number
  emptyTitle?: string
  emptyDescription?: string
  errorTitle?: string
  children?: ReactNode
}

export function PageState({
  loading,
  error,
  empty,
  skeletonRows = 6,
  emptyTitle,
  emptyDescription,
  errorTitle = '加载失败',
  children
}: PageStateProps) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: skeletonRows }} />
  }

  if (error) {
    return <Alert type="error" showIcon message={errorTitle} description={error} />
  }

  if (empty) {
    return <PageStateBlock kind="no-data" title={emptyTitle} description={emptyDescription} />
  }

  return <>{children}</>
}
