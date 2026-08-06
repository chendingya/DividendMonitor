import { type ComponentType, Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from '@renderer/contexts/AuthContext'

function lazyPage<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  name: keyof T & string
) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })))
}

const DashboardPage = lazyPage(() => import('@renderer/pages/DashboardPage'), 'DashboardPage')
const LoginPage = lazyPage(() => import('@renderer/pages/LoginPage'), 'LoginPage')
const AssetSearchPage = lazyPage(() => import('@renderer/pages/AssetSearchPage'), 'AssetSearchPage')
const StockDetailPage = lazyPage(() => import('@renderer/pages/StockDetailPage'), 'StockDetailPage')
const WatchlistPage = lazyPage(() => import('@renderer/pages/WatchlistPage'), 'WatchlistPage')
const DividendCenterPage = lazyPage(() => import('@renderer/pages/DividendCenterPage'), 'DividendCenterPage')
const ComparisonPage = lazyPage(() => import('@renderer/pages/ComparisonPage'), 'ComparisonPage')
const BacktestPage = lazyPage(() => import('@renderer/pages/BacktestPage'), 'BacktestPage')
const UserCenterPage = lazyPage(() => import('@renderer/pages/UserCenterPage'), 'UserCenterPage')
const SettingsPage = lazyPage(() => import('@renderer/pages/SettingsPage'), 'default')
const IndustryAnalysisPage = lazyPage(() => import('@renderer/pages/IndustryAnalysisPage'), 'IndustryAnalysisPage')
const YieldMapPage = lazyPage(() => import('@renderer/pages/YieldMapPage'), 'YieldMapPage')
const BacktestHistoryPage = lazyPage(() => import('@renderer/pages/BacktestHistoryPage'), 'BacktestHistoryPage')
const HousingPage = lazyPage(() => import('@renderer/pages/HousingPage'), 'HousingPage')
const HousingCityDetailPage = lazyPage(() => import('@renderer/pages/HousingCityDetailPage'), 'HousingCityDetailPage')
const MortgageCalculatorPage = lazyPage(() => import('@renderer/pages/MortgageCalculatorPage'), 'MortgageCalculatorPage')

function RouteGuard() {
  const { mode, session } = useAuth()

  if (mode === 'offline') return <Outlet />
  // online mode: require session
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

export function AppRouter() {
  const { loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <Suspense fallback={<PageLoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RouteGuard />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/search" element={<AssetSearchPage />} />
          <Route path="/stock-detail" element={<StockDetailPage />} />
          <Route path="/stock-detail/:symbol" element={<StockDetailPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/dividend-center" element={<DividendCenterPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/comparison/:symbols" element={<ComparisonPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/backtest/:symbol" element={<BacktestPage />} />
          <Route path="/user-center" element={<UserCenterPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/industry-analysis" element={<IndustryAnalysisPage />} />
          <Route path="/yield-map" element={<YieldMapPage />} />
          <Route path="/backtest-history" element={<BacktestHistoryPage />} />
          <Route path="/housing" element={<HousingPage />} />
          <Route path="/housing/:city" element={<HousingCityDetailPage />} />
          <Route path="/housing/mortgage" element={<MortgageCalculatorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#f5f7f9', color: '#66707a', fontSize: 14
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #e5e7eb',
          borderTopColor: '#0052d0', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <span>加载中…</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function PageLoadingScreen() {
  return (
    <div className="ledger-page" aria-busy="true">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 320, color: 'var(--text-soft, #66707a)', fontSize: 13, gap: 10
      }}>
        <div style={{
          width: 20, height: 20, border: '2px solid #e5e7eb',
          borderTopColor: '#0052d0', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <span>页面加载中…</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
