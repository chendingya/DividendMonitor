import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { message } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { buildAssetSearchPath } from '@renderer/services/routeContext'

type AppIconName =
  | 'dashboard'
  | 'dividend'
  | 'watchlist'
  | 'comparison'
  | 'backtest'
  | 'search'
  | 'notification'
  | 'message'
  | 'settings'

type BreadcrumbItem = {
  label: string
  to?: string
}

const menuItems = [
  { key: '/', label: '投资组合', icon: 'dashboard' as const },
  { key: '/stock-detail', label: '股息', icon: 'dividend' as const },
  { key: '/watchlist', label: '自选', icon: 'watchlist' as const },
  { key: '/comparison', label: '数据分析', icon: 'comparison' as const },
  { key: '/backtest', label: '回测', icon: 'backtest' as const }
]

function AppShellIcon({ name, className }: { name: AppIconName; className?: string }) {
  if (name === 'dashboard') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'dividend') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 7.5a4.5 4.5 0 0 0-9 0c0 2.5 2 3.3 4.5 4s4.5 1.5 4.5 4a4.5 4.5 0 0 1-9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'watchlist') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5.5 3.5h13a1.5 1.5 0 0 1 1.5 1.5v15l-8-3-8 3V5a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'comparison') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5.5h16M4 12h9m-9 6.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.5" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'backtest') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 15l3-4 3 2 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 7h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'search') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'notification') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10a5 5 0 1 1 10 0v4l2 2H5l2-2v-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'message') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4a8 8 0 0 0-8 8 8 8 0 0 0 8 8 8 8 0 0 0 8-8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 1.5v3M20.5 12h-3M12 22.5v-3M3.5 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [, messageHolder] = message.useMessage()
  const [topbarKeyword, setTopbarKeyword] = useState('')

  const selectedKey = useMemo(() => {
    const matched = menuItems.find((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))
    return matched?.key ?? '/'
  }, [location.pathname])

  const breadcrumbItems = useMemo<BreadcrumbItem[]>(() => {
    const symbol = new URLSearchParams(location.search).get('symbol')?.trim()
    const items: BreadcrumbItem[] = [{ label: '投资组合', to: '/' }]

    if (location.pathname.startsWith('/stock-detail')) {
      items.push({ label: '股息', to: '/stock-detail' })
      if (symbol) {
        items.push({ label: symbol })
      }
      return items
    }

    if (location.pathname.startsWith('/search')) {
      items.push({ label: '搜索结果' })
      return items
    }

    if (location.pathname.startsWith('/watchlist')) {
      items.push({ label: '自选' })
      return items
    }

    if (location.pathname.startsWith('/comparison')) {
      items.push({ label: '数据分析' })
      return items
    }

    if (location.pathname.startsWith('/backtest')) {
      items.push({ label: '回测' })
      if (symbol) {
        items.push({ label: symbol })
      }
      return items
    }

    return [{ label: '投资组合' }]
  }, [location.pathname, location.search])

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  async function submitTopbarSearch() {
    const keyword = topbarKeyword.trim()
    if (!keyword) {
      return
    }
    navigate(buildAssetSearchPath(keyword))
    setTopbarKeyword('')
  }

  return (
    <div className="ledger-shell">
      {messageHolder}
      <aside className="ledger-sidebar">
        <div className="ledger-sidebar-brand">
          <div className="ledger-sidebar-mark">息</div>
          <div>
            <div className="ledger-sidebar-title">收息佬</div>
            <div className="ledger-sidebar-subtitle">财富简报</div>
          </div>
        </div>

        <nav className="ledger-sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ledger-nav-item ${selectedKey === item.key ? 'is-active' : ''}`}
              onClick={() => navigate(item.key)}
            >
              <span className="ledger-nav-icon">
                <AppShellIcon name={item.icon} className="ledger-icon-svg" />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="ledger-sidebar-footer">
          <button type="button" className="ledger-upgrade-button">
            升级至专业版
          </button>
          <button type="button" className="ledger-help-link">
            帮助中心
          </button>
          <div className="ledger-user-chip">
            <div className="ledger-user-avatar" />
            <div>
              <div className="ledger-user-name">亚历克斯</div>
              <div className="ledger-user-tier">免费版</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="ledger-main">
        <header className="ledger-topbar">
          <div className="ledger-topbar-row">
            <div className="ledger-topbar-search-wrap">
              <span className="ledger-search-icon">
                <AppShellIcon name="search" className="ledger-icon-svg" />
              </span>
              <input
                className="ledger-topbar-search"
                placeholder="输入股票、ETF 或基金代码/名称并回车，例如 510880 / 红利ETF / 贵州茅台"
                value={topbarKeyword}
                onChange={(event) => setTopbarKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void submitTopbarSearch()
                  }
                }}
              />
            </div>
            <div className="ledger-topbar-actions">
              <button type="button" className="ledger-topbar-action is-active has-alert" aria-label="通知">
                <AppShellIcon name="notification" className="ledger-icon-svg" />
              </button>
              <button type="button" className="ledger-topbar-action" aria-label="消息">
                <AppShellIcon name="message" className="ledger-icon-svg" />
              </button>
              <button type="button" className="ledger-topbar-action" aria-label="设置">
                <AppShellIcon name="settings" className="ledger-icon-svg" />
              </button>
            </div>
          </div>
          <div className="ledger-breadcrumb-row">
            <button type="button" className="ledger-back-button" onClick={goBack}>
              返回
            </button>
            <div className="ledger-breadcrumbs" aria-label="面包屑">
              {breadcrumbItems.map((item, index) => {
                const isLast = index === breadcrumbItems.length - 1
                return (
                  <span key={`${item.label}-${index}`} className="ledger-breadcrumb-item-wrap">
                    {item.to && !isLast ? (
                      <button type="button" className="ledger-breadcrumb-item" onClick={() => item.to && navigate(item.to)}>
                        {item.label}
                      </button>
                    ) : (
                      <span className={`ledger-breadcrumb-item ${isLast ? 'is-current' : ''}`}>{item.label}</span>
                    )}
                    {!isLast ? <span className="ledger-breadcrumb-sep">/</span> : null}
                  </span>
                )
              })}
            </div>
          </div>
        </header>
        <main className="ledger-canvas">{children}</main>
      </div>
    </div>
  )
}
