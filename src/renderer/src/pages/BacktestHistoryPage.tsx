import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Popconfirm, message, Empty, Button, Skeleton, Alert } from 'antd'
import type { BacktestResultDto } from '@shared/contracts/api'
import { getBacktestDesktopApi } from '@renderer/services/desktopApi'

type HistoryItem = {
  id: string
  name: string
  assetKey: string
  buyDate: string
  dcaConfig: string | null
  result: BacktestResultDto
  createdAt: string
}

const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function BacktestHistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const api = getBacktestDesktopApi()
      const data = await api.historyList()
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载回测历史失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleDelete(id: string) {
    try {
      const api = getBacktestDesktopApi()
      await api.historyDelete(id)
      void message.success('已删除')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      void message.error('删除失败')
    }
  }

  if (loading) {
    return (
      <div className="ledger-page">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="ledger-page">
        <Alert message="加载失败" description={error} type="error" showIcon />
      </div>
    )
  }

  return (
    <div className="ledger-page">
      <section className="ledger-watchlist-header">
        <div className="ledger-watchlist-copy">
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>回测历史</h1>
          <p className="ledger-hero-subtitle">已保存的回测结果，支持查看和删除。</p>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="ledger-toolbar-card" style={{ textAlign: 'center', padding: 48 }}>
          <Empty description="暂无保存的回测记录">
            <Button type="primary" onClick={() => navigate('/backtest')}>
              前往回测
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="ledger-toolbar-card">
          <Table
            dataSource={items}
            rowKey="id"
            pagination={false}
            columns={[
              {
                title: '名称',
                dataIndex: 'name',
                render: (v: string) => v || <span style={{ color: '#8b949e' }}>未命名</span>
              },
              {
                title: '标的',
                dataIndex: ['result', 'symbol'],
                render: (v: string) => <Tag color="blue">{v}</Tag>
              },
              {
                title: '买入日期',
                dataIndex: ['result', 'buyDate']
              },
              {
                title: '总收益',
                dataIndex: ['result', 'totalReturn'],
                render: (v: number) => (
                  <span style={{ color: v >= 0 ? '#22c55e' : '#e04352', fontWeight: 700 }}>
                    {percent.format(v)}
                  </span>
                )
              },
              {
                title: '最大回撤',
                dataIndex: ['result', 'maxDrawdown'],
                render: (v: number) => (
                  <span style={{ color: '#e04352', fontWeight: 600 }}>
                    {percent.format(v)}
                  </span>
                )
              },
              {
                title: '手续费',
                dataIndex: ['result', 'totalFees'],
                render: (v: number) => currency.format(v)
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                render: (v: string) => v.slice(0, 10)
              },
              {
                title: '操作',
                align: 'right',
                render: (_, record) => (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="ledger-inline-action-btn"
                      onClick={() => navigate(`/backtest?symbol=${record.result.symbol}&buyDate=${record.result.buyDate}`)}
                    >
                      查看
                    </button>
                    <Popconfirm
                      title="确定删除？"
                      onConfirm={() => void handleDelete(record.id)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <button type="button" className="ledger-inline-action-btn" style={{ color: '#e04352' }}>
                        删除
                      </button>
                    </Popconfirm>
                  </div>
                )
              }
            ]}
          />
        </div>
      )}
    </div>
  )
}

export default BacktestHistoryPage
