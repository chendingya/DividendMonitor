import { Button, Card, message as antdMessage } from 'antd'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageState } from '@renderer/components/app/PageState'
import { YieldMapTreemap } from '@renderer/components/yield-map/YieldMapTreemap'
import { useFetch } from '@renderer/hooks/useFetch'
import { yieldMapApi } from '@renderer/services/yieldMapApi'
import { buildStockDetailPath } from '@renderer/services/routeContext'

const LEGEND = [
  { color: '#b31b25', label: '≥7%' },
  { color: '#e8773e', label: '5%~7%' },
  { color: '#f0b429', label: '3.5%~5%' },
  { color: '#2ea86b', label: '2%~3.5%' },
  { color: '#6ba3d6', label: '<2%' },
  { color: '#8b949e', label: '无分红' }
]

export function YieldMapPage() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch(
    () => yieldMapApi.get(),
    [],
    { rethrow: false }
  )

  const handleRefresh = useCallback(async () => {
    antdMessage.loading({ content: '正在抓取全市场数据…', key: 'yield-map-refresh' })
    try {
      await yieldMapApi.refresh()
      await reload()
      antdMessage.success({ content: '股息率地图已更新', key: 'yield-map-refresh' })
    } catch (err) {
      antdMessage.error({ content: err instanceof Error ? err.message : '刷新失败', key: 'yield-map-refresh' })
    }
  }, [reload])

  return (
    <PageState loading={loading} error={error} skeletonRows={12}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>股息率地图</h2>
          <Button onClick={() => void handleRefresh()}>刷新数据</Button>
        </div>
        {data && (
          <>
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {LEGEND.map((item) => (
                  <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 14, background: item.color, borderRadius: 3, display: 'inline-block' }} />
                    {item.label}
                  </span>
                ))}
                <span style={{ marginLeft: 'auto', color: '#66707a', fontSize: 12 }}>
                  {data.stockCount > 0 ? `全市场 ${data.stockCount} 只 · 更新于 ${new Date(data.fetchedAt ?? '').toLocaleString('zh-CN')}` : '暂无数据'}
                </span>
              </div>
            </Card>
            <Card size="small" title="按行业分布（块大小=样本数，颜色=中位数股息率）">
              <YieldMapTreemap
                industries={data.industries}
                stocks={data.stocks}
                onSelectStock={(symbol) => navigate(buildStockDetailPath(symbol))}
              />
            </Card>
          </>
        )}
      </div>
    </PageState>
  )
}

export default YieldMapPage
