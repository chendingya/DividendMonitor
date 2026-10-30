import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AssetDetailDto } from '@shared/contracts/api'
import { toAssetDetailDto } from '@main/application/mappers/stockDtoMappers'
import { parseFundDividendEvents } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'
import { StockDetailPage } from '@renderer/pages/StockDetailPage'

const detailState = vi.hoisted(() => ({ data: null as AssetDetailDto | null }))

vi.mock('@renderer/hooks/useAssetDetail', () => ({
  useAssetDetail: () => ({ data: detailState.data, loading: false, error: null })
}))

vi.mock('@renderer/hooks/useWatchlist', () => ({
  useWatchlist: () => ({ data: [], mutatingAssetKey: null })
}))

describe('asset detail with no dividend records', () => {
  it('keeps ETF profile, price history and actions visible when dividend records are unavailable', () => {
    detailState.data = toAssetDetailDto({
      kind: 'ETF',
      assetType: 'ETF',
      market: 'A_SHARE',
      code: '510880',
      identifier: { assetType: 'ETF', market: 'A_SHARE', code: '510880' },
      name: '红利ETF华泰柏瑞',
      category: '指数型-股票',
      manager: '华泰柏瑞基金',
      latestPrice: 3.27,
      priceHistory: [{ date: '2026-10-29', close: 3.27 }],
      dividendEvents: [],
      dataSource: 'eastmoney'
    })

    const html = renderToStaticMarkup(createElement(StaticRouter, {
      location: '/stock-detail?assetKey=ETF%3AA_SHARE%3A510880'
    }, createElement(StockDetailPage)))

    expect(html).toContain('红利ETF华泰柏瑞')
    expect(html).toContain('3.27')
    expect(html).toContain('价格走势')
    expect(html).toContain('基金画像')
    expect(html).toContain('进入回测')
    expect(html).toContain('暂无历史现金分配数据')
    expect(html).not.toContain('0.00%')
  })

  it('shows the annual yield from the actual ten-unit ETF dividend row', () => {
    const priceHistory = [{ date: '2026-01-20', close: 3.518 }]
    const dividendEvents = parseFundDividendEvents(
      '<tr><td>2026年</td><td>2026-01-20</td><td>2026-01-21</td><td>每10份派现金1.4300元</td><td>2026-01-26</td></tr>',
      priceHistory
    )
    detailState.data = toAssetDetailDto({
      kind: 'ETF',
      assetType: 'ETF',
      market: 'A_SHARE',
      code: '510880',
      identifier: { assetType: 'ETF', market: 'A_SHARE', code: '510880' },
      name: '红利ETF华泰柏瑞',
      latestPrice: 3.27,
      priceHistory,
      dividendEvents,
      dataSource: 'eastmoney'
    })

    const html = renderToStaticMarkup(createElement(StaticRouter, {
      location: '/stock-detail?assetKey=ETF%3AA_SHARE%3A510880'
    }, createElement(StockDetailPage)))

    expect(html).toContain('红利ETF华泰柏瑞')
    expect(html).toContain('历史收益率（自然年）')
    expect(html).toContain('4.06%')
    expect(html).toContain('2026-01-21')
    expect(html).toContain('最近一次每份现金分配')
    expect(html).toContain('预计每份分配')
    expect(html).toContain('元/份')
    expect(html).toContain('0.1430 元/份')
    expect(html).toMatch(/<td[^>]*>0\.1430<\/td>/)
    expect(html).not.toContain('元/股')
    expect(html).not.toContain('暂无历史现金分配数据')
  })
})
