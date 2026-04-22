type PageStateKind = 'empty' | 'no-data'

type PageStateCopy = {
  title: string
  description: string
}

const PAGE_STATE_COPY: Record<PageStateKind, PageStateCopy> = {
  empty: {
    title: '当前还没有可展示的内容',
    description: '请先补充筛选条件或选择股票后再试。'
  },
  'no-data': {
    title: '暂未获取到可用数据',
    description: '已完成请求，但当前条件下没有可用于展示的记录。'
  }
}

type PageStateBlockProps = {
  kind: PageStateKind
  title?: string
  description?: string
}

export function PageStateBlock({ kind, title, description }: PageStateBlockProps) {
  const fallback = PAGE_STATE_COPY[kind]

  return (
    <section className={`page-state-block page-state-block--${kind}`} role="status" aria-live="polite">
      <h2 className="page-state-title">{title ?? fallback.title}</h2>
      <p className="page-state-description">{description ?? fallback.description}</p>
    </section>
  )
}
