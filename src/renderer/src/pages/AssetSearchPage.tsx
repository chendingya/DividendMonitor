import { Alert, Button, Input, Space, Table, Tag, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AssetSearchItemDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { useWatchlist } from '@renderer/hooks/useWatchlist'
import { assetApi } from '@renderer/services/assetApi'
import { buildAssetDetailPath, buildAssetSearchPath, rememberLastAssetKey, rememberLastSymbol } from '@renderer/services/routeContext'

export function AssetSearchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [apiMessage, messageHolder] = message.useMessage()
  const initialKeyword = searchParams.get('keyword')?.trim() ?? ''
  const [keyword, setKeyword] = useState(initialKeyword)
  const [results, setResults] = useState<AssetSearchItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: watchlistItems, addAsset, mutatingAssetKey } = useWatchlist()

  useEffect(() => {
    setKeyword(initialKeyword)
  }, [initialKeyword])

  useEffect(() => {
    let disposed = false

    async function load() {
      if (!initialKeyword) {
        if (!disposed) {
          setResults([])
          setError(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        const items = await assetApi.search({
          keyword: initialKeyword,
          assetTypes: ['STOCK', 'ETF', 'FUND']
        })
        if (!disposed) {
          setResults(items)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : '搜索失败，请稍后重试')
          setResults([])
        }
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      disposed = true
    }
  }, [initialKeyword])

  const watchlistAssetKeys = useMemo(() => new Set(watchlistItems.map((item) => item.assetKey)), [watchlistItems])

  function submitSearch() {
    const normalized = keyword.trim()
    navigate(buildAssetSearchPath(normalized))
  }

  function openDetail(item: AssetSearchItemDto) {
    rememberLastAssetKey(item.assetKey)
    if (item.assetType === 'STOCK' && item.symbol) {
      rememberLastSymbol(item.symbol)
    }
    navigate(buildAssetDetailPath(item.assetKey))
  }

  async function addToWatchlist(item: AssetSearchItemDto) {
    try {
      await addAsset({ assetKey: item.assetKey })
      apiMessage.success(`已将 ${item.name} 加入自选`)
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '加入自选失败')
    }
  }

  return (
    <div className="ledger-page">
      {messageHolder}
      <section className="ledger-hero-card">
        <div className="ledger-hero-copy">
          <div>
            <div className="ledger-section-kicker">资产搜索</div>
            <h1 className="ledger-hero-title">搜索股票、ETF 和基金</h1>
            <p className="ledger-hero-subtitle">输入代码或名称，先查看候选结果，再进入详情页。</p>
          </div>
        </div>
      </section>

      <AppCard title="搜索条件">
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入代码或名称，例如 510880 / 红利ETF / 贵州茅台"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={submitSearch}
          />
          <Button type="primary" loading={loading} onClick={submitSearch}>
            搜索
          </Button>
        </Space.Compact>
      </AppCard>

      {error ? <Alert type="error" message={error} /> : null}

      {!initialKeyword ? (
        <PageStateBlock kind="empty" title="输入关键词开始搜索" description="支持股票代码、ETF 代码、基金代码以及资产名称。" />
      ) : results.length === 0 && !loading ? (
        <PageStateBlock
          kind="no-data"
          title="没有找到匹配结果"
          description={`未找到与“${initialKeyword}”匹配的股票、ETF 或基金，请尝试更完整的代码或名称。`}
        />
      ) : (
        <AppCard title={`搜索结果${initialKeyword ? `：${initialKeyword}` : ''}`}>
          <Table
            className="soft-table"
            rowKey="assetKey"
            loading={loading}
            pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
            dataSource={results}
            columns={[
              {
                title: '资产',
                render: (_, record: AssetSearchItemDto) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AssetAvatar name={record.name} assetType={record.assetType} size={32} />
                    <div>
                      <Typography.Text strong>{record.name}</Typography.Text>
                      <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>
                        {record.symbol ?? record.code} · {record.assetKey}
                      </div>
                    </div>
                  </div>
                )
              },
              {
                title: '类型',
                dataIndex: 'assetType',
                width: 100,
                render: (value: AssetSearchItemDto['assetType']) => <Tag color={value === 'STOCK' ? 'blue' : 'geekblue'}>{value}</Tag>
              },
              {
                title: '市场',
                dataIndex: 'market',
                width: 110
              },
              {
                title: '操作',
                width: 240,
                render: (_, record: AssetSearchItemDto) => (
                  <Space>
                    <Button onClick={() => openDetail(record)}>查看详情</Button>
                    <Button
                      type="primary"
                      ghost
                      disabled={watchlistAssetKeys.has(record.assetKey)}
                      loading={mutatingAssetKey === record.assetKey}
                      onClick={() => addToWatchlist(record)}
                    >
                      {watchlistAssetKeys.has(record.assetKey) ? '已在自选' : '加入自选'}
                    </Button>
                  </Space>
                )
              }
            ]}
          />
        </AppCard>
      )}
    </div>
  )
}
