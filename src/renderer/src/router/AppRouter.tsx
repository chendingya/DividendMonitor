import { Navigate, Route, Routes } from 'react-router-dom'
import { BacktestPage } from '@renderer/pages/BacktestPage'
import { ComparisonPage } from '@renderer/pages/ComparisonPage'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import { StockDetailPage } from '@renderer/pages/StockDetailPage'
import { WatchlistPage } from '@renderer/pages/WatchlistPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/stock-detail" element={<StockDetailPage />} />
      <Route path="/stock-detail/:symbol" element={<StockDetailPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/comparison" element={<ComparisonPage />} />
      <Route path="/comparison/:symbols" element={<ComparisonPage />} />
      <Route path="/backtest" element={<BacktestPage />} />
      <Route path="/backtest/:symbol" element={<BacktestPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
