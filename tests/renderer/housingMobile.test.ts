import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HousingPage } from '@renderer/pages/HousingPage'
import { HousingYieldCard } from '@renderer/components/dashboard/HousingYieldCard'

vi.mock('@renderer/hooks/useIsMobile', () => ({ useIsMobile: () => true }))
vi.mock('@renderer/hooks/useHousing', () => ({
  useHousingCities: () => ({
    data: [
      { city: '北京', pricePerSqm: 50000, rentPerSqm: 100, rentalYieldPercent: 1.92, priceToRentRatio: 52.08, yieldSource: 'custom', isWatched: true },
      { city: '上海', pricePerSqm: 60000, rentPerSqm: 80, yieldSource: 'custom', isWatched: false }
    ],
    loading: false, error: null, reload: async () => {}, toggleWatch: async () => {}, mutatingCity: null
  })
}))

function render(component: typeof HousingPage | typeof HousingYieldCard) {
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(component)))
}

describe('手机房价观察入口和指标来源', () => {
  it('城市卡片直接展示详情及关注操作，不需要横滑宽表', () => {
    const html = render(HousingPage)
    expect(html).toContain('aria-label="查看房产 北京"')
    expect(html).toContain('aria-label="取消关注 北京"')
    expect(html).toContain('aria-label="关注 上海"')
    expect(html).not.toContain('<table')
    expect(html).toContain('1.92%')
    expect(html).toContain('自定义收益率')
    expect(html).toContain('待补充总价和月租金')
  })

  it('首页房产收息标明自定义口径，避免误认为城市市场收益率', () => {
    const html = render(HousingYieldCard)
    expect(html).toContain('1.92%')
    expect(html).toContain('自定义')
  })
})
