import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WatchlistEntryDto } from '@shared/contracts/api'
import { WatchlistTable } from '@renderer/components/watchlist/WatchlistTable'

function renderItem(item: WatchlistEntryDto) {
  return renderToStaticMarkup(createElement(WatchlistTable, {
    items: [item], groups: [], getAssetGroupIds: async () => [], onToggleAssetGroup: async () => {}
  }))
}

const identity = { assetKey: 'STOCK:A_SHARE:601398', assetType: 'STOCK' as const, market: 'A_SHARE' as const, code: '601398', name: '工商银行' }

describe('自选缺失行情显示', () => {
  it('没有行情的本地资产仍显示名称、占位符和未获取行情提示', () => {
    const html = renderItem({ ...identity, quoteStatus: 'unavailable' })
    expect(html).toContain('工商银行')
    expect(html).toContain('--')
    expect(html).toContain('未获取行情')
    expect(html).not.toContain('0.00')
  })

  it('过期快照价格明确显示缓存状态及原快照时间', () => {
    const html = renderItem({ ...identity, latestPrice: 7.36, quoteStatus: 'stale', quoteUpdatedAt: '2020-01-02T03:04:05.000Z' })
    expect(html).toContain('7.36')
    expect(html).toContain('缓存行情')
    expect(html).toContain('2020-01-02')
  })
})
