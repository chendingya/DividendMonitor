import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Menu, message } from 'antd'
import type { MenuProps } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { buildAssetSearchPath } from '@renderer/services/routeContext'
import { useAuth } from '@renderer/contexts/AuthContext'

type AppIconName =
  | 'dashboard'
  | 'dividend'
  | 'dividend-center'
  | 'yield-map'
  | 'watchlist'
  | 'backtest'
  | 'housing'
  | 'user'
  | 'search'
  | 'notification'
  | 'message'
  | 'settings'

type BreadcrumbItem = {
  label: string
  to?: string
}

type NavItem = {
  key: string
  label: string
  icon: AppIconName
}

const menuItems: MenuProps['items'] = [
  {
    key: '/',
    label: '投资组合',
    icon: <AppShellIcon name="dashboard" className="ledger-icon-svg" />
  },
  {
    key: '/watchlist',
    label: '自选',
    icon: <AppShellIcon name="watchlist" className="ledger-icon-svg" />
  },
  {
    key: 'backtest',
    label: '回测',
    icon: <AppShellIcon name="backtest" className="ledger-icon-svg" />,
    children: [
      { key: '/backtest', label: '回测' },
      { key: '/backtest-history', label: '回测历史' }
    ]
  },
  {
    key: '/dividend-center',
    label: '分红统计',
    icon: <AppShellIcon name="dividend-center" className="ledger-icon-svg" />
  },
  {
    key: '/yield-map',
    label: '股息率地图',
    icon: <AppShellIcon name="yield-map" className="ledger-icon-svg" />
  },
  {
    key: '/housing',
    label: '房产',
    icon: <AppShellIcon name="housing" className="ledger-icon-svg" />
  },
  { type: 'divider' },
  {
    key: '/user-center',
    label: '用户中心',
    icon: <AppShellIcon name="user" className="ledger-icon-svg" />
  },
  {
    key: '/settings',
    label: '设置',
    icon: <AppShellIcon name="settings" className="ledger-icon-svg" />
  }
]

const NAV_ROUTES: NavItem[] = [
  { key: '/', label: '投资组合', icon: 'dashboard' },
  { key: '/watchlist', label: '自选', icon: 'watchlist' },
  { key: '/backtest', label: '回测', icon: 'backtest' },
  { key: '/backtest-history', label: '回测历史', icon: 'backtest' },
  { key: '/dividend-center', label: '分红统计', icon: 'dividend-center' },
  { key: '/yield-map', label: '股息率地图', icon: 'yield-map' },
  { key: '/housing', label: '房产', icon: 'housing' },
  { key: '/user-center', label: '用户中心', icon: 'user' },
  { key: '/settings', label: '设置', icon: 'settings' }
]

function matchNavKey(pathname: string): string {
  return NAV_ROUTES.find((item) => pathname === item.key || pathname.startsWith(`${item.key}/`))?.key ?? '/'
}

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

  if (name === 'dividend-center') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="13" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="10" y="9" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="16" y="5" width="4" height="15" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 4.5h5M6.5 2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

  if (name === 'backtest') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 15l3-4 3 2 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 7h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'housing') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3.5 11 12 4l8.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 20v-5h4v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'yield-map') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="7" y="7" width="6" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="15" y="7" width="3" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="13.5" width="3" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="12" y="13.5" width="6" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
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

  if (name === 'user') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
  const { mode, session, logout } = useAuth()
  const [, messageHolder] = message.useMessage()
  const [topbarKeyword, setTopbarKeyword] = useState('')

  useEffect(() => {
    const prefetchTimer = setTimeout(() => {
      void import('@renderer/pages/YieldMapPage')
      void import('@renderer/pages/DividendCenterPage')
      void import('@renderer/pages/HousingPage')
      void import('@renderer/pages/WatchlistPage')
      void import('@renderer/pages/BacktestPage')
      void import('@renderer/services/yieldMapApi').then(({ yieldMapApi: api }) => {
        void api.get().catch(() => undefined)
      })
    }, 2000)
    return () => clearTimeout(prefetchTimer)
  }, [])

  const selectedKey = useMemo(() => matchNavKey(location.pathname), [location.pathname])

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

    if (location.pathname.startsWith('/dividend-center')) {
      items.push({ label: '分红统计' })
      return items
    }

    if (location.pathname.startsWith('/yield-map')) {
      items.push({ label: '股息率地图' })
      return items
    }

    if (location.pathname.startsWith('/housing')) {
      items.push({ label: '房产' })
      if (location.pathname.startsWith('/housing/mortgage')) {
        items.push({ label: '房贷计算器' })
      }
      return items
    }

    if (location.pathname.startsWith('/user-center')) {
      items.push({ label: '用户中心' })
      return items
    }

    if (location.pathname.startsWith('/settings')) {
      items.push({ label: '设置' })
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
          <Menu
            mode="inline"
            items={menuItems}
            selectedKeys={[selectedKey]}
            onClick={({ key }) => navigate(key)}
            style={{ background: 'transparent', borderInlineEnd: 'none' }}
          />
        </nav>

        <div className="ledger-sidebar-footer">
          {mode === 'online' && session ? (
            <>
              <div
                className="ledger-user-chip is-clickable"
                onClick={() => navigate('/user-center')}
              >
                <div className="ledger-user-avatar is-online">
                  {(session.user.email ?? '?')[0].toUpperCase()}
                </div>
                <div>
                  <div className="ledger-user-name is-truncated">
                    {session.user.email ?? '在线用户'}
                  </div>
                  <div className="ledger-user-tier is-online">在线 · 已同步</div>
                </div>
              </div>
              <button
                type="button"
                className="ledger-help-link is-logout"
                onClick={() => { void logout() }}
              >
                退出登录
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ledger-upgrade-button"
                onClick={() => navigate('/user-center')}
              >
                登录 / 注册
              </button>
              <button type="button" className="ledger-help-link">
                帮助中心
              </button>
              <div
                className="ledger-user-chip is-clickable"
                onClick={() => navigate('/user-center')}
              >
                <div className="ledger-user-avatar" />
                <div>
                  <div className="ledger-user-name">离线模式</div>
                  <div className="ledger-user-tier is-offline">数据仅存于本机</div>
                </div>
              </div>
            </>
          )}
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
                placeholder="输入股票、ETF、基金或贵金属代码/名称并回车，例如 510880 / 红利ETF / 贵州茅台 / 黄金"
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
              <button type="button" className="ledger-topbar-action" aria-label="设置" onClick={() => navigate('/settings')}>
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
