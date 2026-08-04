import { Button, Input, Table, Tag, Tooltip, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageState } from '@renderer/components/app/PageState'
import { useHousingCities } from '@renderer/hooks/useHousing'
import type { HousingCitySummaryDto } from '@shared/contracts/api'

function formatPercent(value: number | undefined, digits = 2): string {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
}

export function HousingPage() {
  const navigate = useNavigate()
  const [apiMessage, messageHolder] = message.useMessage()
  const [keyword, setKeyword] = useState('')
  const { data, loading, error, reload, toggleWatch, mutatingCity } = useHousingCities()

  const filteredData = useMemo(() => {
    if (!data) return []
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return data
    return data.filter((item) => item.city.includes(normalized))
  }, [data, keyword])

  const watchedCount = useMemo(() => data?.filter((item) => item.isWatched).length ?? 0, [data])

  async function handleToggleWatch(city: HousingCitySummaryDto) {
    try {
      await toggleWatch(city.city, !city.isWatched)
      await reload()
      apiMessage.success(city.isWatched ? `已取消关注 ${city.city}` : `已关注 ${city.city}`)
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '操作失败')
    }
  }

  const columns: ColumnsType<HousingCitySummaryDto> = [
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      fixed: 'left',
      width: 110,
      render: (city: string) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/housing/${encodeURIComponent(city)}`)}>
          {city}
        </Button>
      )
    },
    {
      title: '新建均价 (元/㎡)',
      dataIndex: 'pricePerSqm',
      key: 'pricePerSqm',
      align: 'right',
      width: 130,
      render: (value?: number) => value?.toLocaleString() ?? '--'
    },
    {
      title: '二手均价 (元/㎡)',
      dataIndex: 'secondHandPricePerSqm',
      key: 'secondHandPricePerSqm',
      align: 'right',
      width: 130,
      render: (value?: number) => value?.toLocaleString() ?? '--'
    },
    {
      title: '月租金 (元/㎡)',
      dataIndex: 'rentPerSqm',
      key: 'rentPerSqm',
      align: 'right',
      width: 130,
      render: (value?: number) =>
        value == null ? (
          <Tooltip title="该城市暂不在中指研究院 50 城租金覆盖范围内">
            <Tag color="default">暂无租金</Tag>
          </Tooltip>
        ) : (
          value.toFixed(1)
        )
    },
    {
      title: '租金收益率',
      dataIndex: 'rentalYieldPercent',
      key: 'rentalYieldPercent',
      align: 'right',
      width: 110,
      sorter: (a, b) => (a.rentalYieldPercent ?? -1) - (b.rentalYieldPercent ?? -1),
      render: (value?: number) =>
        value == null ? (
          <span style={{ color: '#8b949e', fontSize: 12 }}>暂无</span>
        ) : (
          <span style={{ color: value > 2 ? '#1a7f37' : '#57606a' }}>{value.toFixed(2)}%</span>
        )
    },
    {
      title: '租售比 (年)',
      dataIndex: 'priceToRentRatio',
      key: 'priceToRentRatio',
      align: 'right',
      width: 110,
      render: (value?: number) => (value == null ? '--' : `${value.toFixed(1)} 年`)
    },
    {
      title: '环比',
      dataIndex: 'momPercent',
      key: 'momPercent',
      align: 'right',
      width: 90,
      render: (value?: number) => (
        <span style={{ color: value != null && value >= 0 ? '#cf222e' : '#1a7f37' }}>{formatPercent(value)}</span>
      )
    },
    {
      title: '同比',
      dataIndex: 'yoyPercent',
      key: 'yoyPercent',
      align: 'right',
      width: 90,
      render: (value?: number) => (
        <span style={{ color: value != null && value >= 0 ? '#cf222e' : '#1a7f37' }}>{formatPercent(value)}</span>
      )
    },
    {
      title: '状态',
      key: 'watched',
      width: 90,
      render: (_, record) =>
        record.isWatched ? <Tag color="blue">已关注</Tag> : <Tag>未关注</Tag>
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Button
          size="small"
          type={record.isWatched ? 'default' : 'primary'}
          loading={mutatingCity === record.city}
          onClick={() => handleToggleWatch(record)}
        >
          {record.isWatched ? '取消关注' : '关注'}
        </Button>
      )
    }
  ]

  return (
    <PageState loading={loading} error={error}>
      <div className="ledger-page">
        {messageHolder}

        <section className="ledger-watchlist-header">
          <div className="ledger-watchlist-copy">
            <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
              房价观察
            </h1>
            <p className="ledger-hero-subtitle">跟踪百城房价与租金，用收息视角评估房产配置。</p>
            <div className="ledger-watchlist-summary">
              <span className="pill primary">已关注 {watchedCount} 城</span>
              <span className="pill">共 {data?.length ?? 0} 城</span>
              <span className="pill">数据源：中指研究院 + 国家统计局（经东财）</span>
            </div>
          </div>
          <div className="ledger-hero-actions">
            <button type="button" className="ledger-secondary-button" onClick={() => void reload()}>
              刷新数据
            </button>
            <button type="button" className="ledger-primary-button" onClick={() => navigate('/housing/mortgage')}>
              房贷计算器
            </button>
          </div>
        </section>

        <section className="ledger-toolbar-card" style={{ marginTop: 20 }}>
          <div className="ledger-filter-bar" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Input
              allowClear
              placeholder="筛选城市"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 240 }}
            />
            <span style={{ fontSize: 12, color: '#8b949e' }}>
              点击城市名查看指数趋势、租金走势与自定义数据。
            </span>
          </div>
        </section>

        <section style={{ marginTop: 20 }}>
          <Table<HousingCitySummaryDto>
            rowKey="city"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 1020 }}
          />
        </section>
      </div>
    </PageState>
  )
}
