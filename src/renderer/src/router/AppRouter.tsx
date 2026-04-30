import { AssetSearchPage } from '@renderer/pages/AssetSearchPage'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { BacktestPage } from '@renderer/pages/BacktestPage'
import { ComparisonPage } from '@renderer/pages/ComparisonPage'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import { LoginPage } from '@renderer/pages/LoginPage'
import { StockDetailPage } from '@renderer/pages/StockDetailPage'
import { UserCenterPage } from '@renderer/pages/UserCenterPage'
import { WatchlistPage } from '@renderer/pages/WatchlistPage'
import { useAuth } from '@renderer/contexts/AuthContext'

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RouteGuard />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/search" element={<AssetSearchPage />} />
        <Route path="/stock-detail" element={<StockDetailPage />} />
        <Route path="/stock-detail/:symbol" element={<StockDetailPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/comparison" element={<ComparisonPage />} />
        <Route path="/comparison/:symbols" element={<ComparisonPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/backtest/:symbol" element={<BacktestPage />} />
        <Route path="/user-center" element={<UserCenterPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
