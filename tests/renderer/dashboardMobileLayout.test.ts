import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DashboardHero, DashboardSearchCard } from '@renderer/components/dashboard/DashboardHero'

const viewport = vi.hoisted(() => ({ mobile: true }))
vi.mock('@renderer/hooks/useIsMobile', () => ({ useIsMobile: () => viewport.mobile }))

function renderHero() {
  return renderToStaticMarkup(createElement(DashboardHero, {
    rows: [], positions: [], refreshing: false,
    onSearch: () => {}, onRefresh: () => {}, onExportReport: () => {},
    onExportPositions: () => {}, onImport: () => {}, onAdd: () => {}
  }))
}

describe('手机工作台操作层级', () => {
  it('将搜索和录入作为直接操作，其他功能通过可展开菜单保留', () => {
    viewport.mobile = true
    const html = renderHero()
    const disclosure = html.match(/<details\b[\s\S]*?<\/details>/)?.[0]
    expect(disclosure).toBeDefined()
    expect(disclosure).toContain('更多操作')
    for (const action of ['导出报告', '导出持仓', '导入持仓', '刷新估值']) {
      expect(disclosure).toContain(action)
    }
    const primary = html.replace(disclosure ?? '', '')
    expect(primary.match(/<button\b/g)).toHaveLength(2)
    expect(primary).toContain('搜索资产')
    expect(primary).toContain('录入持仓')
    expect(primary).toMatch(/<h1\b[^>]*>工作台<\/h1>/)
  })

  it('桌面继续直接提供全部六个操作', () => {
    viewport.mobile = false
    const html = renderHero()
    expect(html.match(/<button\b/g)).toHaveLength(6)
    expect(html).not.toContain('<details')
  })

  it('手机的辅助搜索表单可展开使用，不重复占据首屏', () => {
    viewport.mobile = true
    const html = renderToStaticMarkup(createElement(DashboardSearchCard, {
      searchKeyword: '601398', onSearchKeywordChange: () => {}, onSearch: () => {}
    }))
    expect(html).toMatch(/<details\b[\s\S]*<summary\b/)
    expect(html).toContain('按代码或名称搜索')
    expect(html).toContain('value="601398"')
    expect(html).toMatch(/<button\b[^>]*>搜索<\/button>/)
  })
})
