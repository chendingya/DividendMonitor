$ErrorActionPreference = 'Stop'

$files = @(
  @{
    Path = 'package.json'
    Content = @'
{
  "name": "shou-xi-lao",
  "version": "0.1.0",
  "private": true,
  "description": "收息佬 desktop app scaffold",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "axios": "^1.9.0",
    "antd": "^5.27.0",
    "echarts": "^5.6.0",
    "electron-log": "^5.4.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.1",
    "zod": "^3.24.4",
    "zustand": "^4.5.7"
  },
  "devDependencies": {
    "@types/node": "^22.15.3",
    "@types/react": "^18.3.22",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.4.1",
    "electron": "^35.2.1",
    "electron-vite": "^3.1.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5"
  }
}
'@
  },
  @{
    Path = 'tsconfig.json'
    Content = @'
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@preload/*": ["src/preload/*"],
      "@renderer/*": ["src/renderer/src/*"],
      "@shared/*": ["shared/*"]
    },
    "types": ["node"]
  },
  "include": ["electron.vite.config.ts", "src", "shared"]
}
'@
  },
  @{
    Path = 'electron.vite.config.ts'
    Content = @'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react()]
  }
})
'@
  },
  @{
    Path = 'shared/contracts/api.ts'
    Content = @'
export type HistoricalYieldPointDto = {
  year: number
  yield: number
  events: number
}

export type FutureYieldEstimateDto = {
  estimatedDividendPerShare: number
  estimatedFutureYield: number
  method: 'baseline' | 'conservative'
  steps: string[]
}

export type StockSearchItemDto = {
  symbol: string
  name: string
  market: 'A_SHARE'
}

export type StockDetailDto = {
  symbol: string
  name: string
  market: 'A_SHARE'
  industry?: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
  yearlyYields: HistoricalYieldPointDto[]
  futureYieldEstimate: FutureYieldEstimateDto
}

export interface DividendMonitorApi {
  stock: {
    search(keyword: string): Promise<StockSearchItemDto[]>
    getDetail(symbol: string): Promise<StockDetailDto>
  }
}

declare global {
  interface Window {
    dividendMonitor: DividendMonitorApi
  }
}
'@
  },
  @{
    Path = 'src/main/domain/entities/Stock.ts'
    Content = @'
export type Stock = {
  symbol: string
  name: string
  market: 'A_SHARE'
  industry?: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
}

export type DividendEvent = {
  year: number
  dividendPerShare: number
  referenceClosePrice: number
}
'@
  },
  @{
    Path = 'src/main/domain/services/dividendYieldService.ts'
    Content = @'
import type { DividendEvent } from '@main/domain/entities/Stock'

export function buildHistoricalYields(events: DividendEvent[]) {
  const grouped = new Map<number, { year: number; yield: number; events: number }>()

  for (const event of events) {
    const current = grouped.get(event.year) ?? { year: event.year, yield: 0, events: 0 }
    const eventYield = event.referenceClosePrice > 0 ? event.dividendPerShare / event.referenceClosePrice : 0

    current.yield += eventYield
    current.events += 1
    grouped.set(event.year, current)
  }

  return [...grouped.values()].sort((a, b) => a.year - b.year)
}
'@
  },
  @{
    Path = 'src/main/domain/services/futureYieldEstimator.ts'
    Content = @'
export type FutureYieldInput = {
  latestPrice: number
  latestTotalShares: number
  latestAnnualNetProfit: number
  lastAnnualPayoutRatio: number
  lastYearTotalDividendAmount: number
}

export function estimateFutureYield(input: FutureYieldInput) {
  const baselineTotalDividend = input.latestAnnualNetProfit * input.lastAnnualPayoutRatio
  const baselineDividendPerShare = baselineTotalDividend / input.latestTotalShares
  const baselineYield = baselineDividendPerShare / input.latestPrice

  const conservativeDividendPerShare = input.lastYearTotalDividendAmount / input.latestTotalShares
  const conservativeYield = conservativeDividendPerShare / input.latestPrice

  return {
    baseline: {
      estimatedDividendPerShare: baselineDividendPerShare,
      estimatedFutureYield: baselineYield,
      method: 'baseline' as const,
      steps: [
        'latestAnnualNetProfit * lastAnnualPayoutRatio = estimatedTotalDividend',
        'estimatedTotalDividend / latestTotalShares = estimatedDividendPerShare',
        'estimatedDividendPerShare / latestPrice = estimatedFutureYield'
      ]
    },
    conservative: {
      estimatedDividendPerShare: conservativeDividendPerShare,
      estimatedFutureYield: conservativeYield,
      method: 'conservative' as const,
      steps: [
        'lastYearTotalDividendAmount / latestTotalShares = estimatedDividendPerShare',
        'estimatedDividendPerShare / latestPrice = estimatedFutureYield'
      ]
    }
  }
}
'@
  },
  @{
    Path = 'src/main/repositories/stockRepository.ts'
    Content = @'
import type { Stock, DividendEvent } from '@main/domain/entities/Stock'

export type StockDetailSource = {
  stock: Stock
  dividendEvents: DividendEvent[]
  latestAnnualNetProfit: number
  latestTotalShares: number
  lastAnnualPayoutRatio: number
  lastYearTotalDividendAmount: number
}

const MOCK_STOCKS: StockDetailSource[] = [
  {
    stock: {
      symbol: '600519',
      name: 'Kweichow Moutai',
      market: 'A_SHARE',
      industry: 'Baijiu',
      latestPrice: 1688,
      marketCap: 2120000000000,
      peRatio: 24.8
    },
    dividendEvents: [
      { year: 2022, dividendPerShare: 21.675, referenceClosePrice: 1680 },
      { year: 2023, dividendPerShare: 25.911, referenceClosePrice: 1725 },
      { year: 2024, dividendPerShare: 30.876, referenceClosePrice: 1768 }
    ],
    latestAnnualNetProfit: 74700000000,
    latestTotalShares: 1256197800,
    lastAnnualPayoutRatio: 0.76,
    lastYearTotalDividendAmount: 38800000000
  }
]

export class StockRepository {
  async search(keyword: string) {
    const normalized = keyword.trim()

    return MOCK_STOCKS
      .filter(({ stock }) => stock.symbol.includes(normalized) || stock.name.includes(normalized))
      .map(({ stock }) => ({ symbol: stock.symbol, name: stock.name, market: stock.market }))
  }

  async getDetail(symbol: string): Promise<StockDetailSource> {
    const match = MOCK_STOCKS.find(({ stock }) => stock.symbol === symbol)

    if (!match) {
      throw new Error(`Stock ${symbol} not found in scaffold repository`)
    }

    return match
  }
}
'@
  },
  @{
    Path = 'src/main/application/useCases/getStockDetail.ts'
    Content = @'
import type { StockDetailDto } from '@shared/contracts/api'
import { buildHistoricalYields } from '@main/domain/services/dividendYieldService'
import { estimateFutureYield } from '@main/domain/services/futureYieldEstimator'
import { StockRepository } from '@main/repositories/stockRepository'

export async function getStockDetail(symbol: string): Promise<StockDetailDto> {
  const repository = new StockRepository()
  const source = await repository.getDetail(symbol)
  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const estimates = estimateFutureYield({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  })

  return {
    symbol: source.stock.symbol,
    name: source.stock.name,
    market: source.stock.market,
    industry: source.stock.industry,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    yearlyYields,
    futureYieldEstimate: estimates.baseline
  }
}
'@
  },
  @{
    Path = 'src/main/application/useCases/searchStocks.ts'
    Content = @'
import type { StockSearchItemDto } from '@shared/contracts/api'
import { StockRepository } from '@main/repositories/stockRepository'

export async function searchStocks(keyword: string): Promise<StockSearchItemDto[]> {
  const repository = new StockRepository()
  return repository.search(keyword)
}
'@
  },
  @{
    Path = 'src/main/ipc/channels/stockChannels.ts'
    Content = @'
import { ipcMain } from 'electron'
import { getStockDetail } from '@main/application/useCases/getStockDetail'
import { searchStocks } from '@main/application/useCases/searchStocks'

export function registerStockChannels() {
  ipcMain.handle('stock:search', async (_event, keyword: string) => {
    return searchStocks(keyword)
  })

  ipcMain.handle('stock:get-detail', async (_event, symbol: string) => {
    return getStockDetail(symbol)
  })
}
'@
  },
  @{
    Path = 'src/main/ipc/channels/index.ts'
    Content = @'
import { registerStockChannels } from '@main/ipc/channels/stockChannels'

export function registerIpcHandlers() {
  registerStockChannels()
}
'@
  },
  @{
    Path = 'src/main/index.ts'
    Content = @'
import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpcHandlers } from '@main/ipc/channels'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
'@
  },
  @{
    Path = 'src/preload/index.ts'
    Content = @'
import { contextBridge, ipcRenderer } from 'electron'
import type { DividendMonitorApi } from '@shared/contracts/api'

const api: DividendMonitorApi = {
  stock: {
    search: (keyword) => ipcRenderer.invoke('stock:search', keyword),
    getDetail: (symbol) => ipcRenderer.invoke('stock:get-detail', symbol)
  }
}

contextBridge.exposeInMainWorld('dividendMonitor', api)
'@
  },
  @{
    Path = 'src/renderer/index.html'
    Content = @'
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DividendMonitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
'@
  },
  @{
    Path = 'src/renderer/src/services/api/stockApi.ts'
    Content = @'
export const stockApi = {
  search(keyword: string) {
    return window.dividendMonitor.stock.search(keyword)
  },
  getDetail(symbol: string) {
    return window.dividendMonitor.stock.getDetail(symbol)
  }
}
'@
  },
  @{
    Path = 'src/renderer/src/hooks/useStockDetail.ts'
    Content = @'
import { useEffect, useState } from 'react'
import type { StockDetailDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/api/stockApi'

export function useStockDetail(symbol: string) {
  const [data, setData] = useState<StockDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const detail = await stockApi.getDetail(symbol)
        if (!disposed) {
          setData(detail)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load stock detail')
        }
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      disposed = true
    }
  }, [symbol])

  return { data, loading, error }
}
'@
  },
  @{
    Path = 'src/renderer/src/components/app/AppCard.tsx'
    Content = @'
import { Card } from 'antd'
import type { PropsWithChildren } from 'react'

export function AppCard({ children }: PropsWithChildren) {
  return <Card bordered={false}>{children}</Card>
}
'@
  },
  @{
    Path = 'src/renderer/src/features/stock-detail/components/FutureYieldEstimateCard.tsx'
    Content = @'
import { Descriptions, List, Tag, Typography } from 'antd'
import type { FutureYieldEstimateDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function FutureYieldEstimateCard({ estimate }: { estimate: FutureYieldEstimateDto }) {
  return (
    <AppCard>
      <Descriptions title="Future Yield Estimate" column={1}>
        <Descriptions.Item label="Method">
          <Tag color={estimate.method === 'baseline' ? 'blue' : 'gold'}>{estimate.method}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Dividend Per Share">
          {estimate.estimatedDividendPerShare.toFixed(3)}
        </Descriptions.Item>
        <Descriptions.Item label="Estimated Yield">
          {percent.format(estimate.estimatedFutureYield)}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Title level={5}>Calculation Steps</Typography.Title>
      <List
        size="small"
        dataSource={estimate.steps}
        renderItem={(step) => <List.Item>{step}</List.Item>}
      />
    </AppCard>
  )
}
'@
  },
  @{
    Path = 'src/renderer/src/features/stock-detail/components/DividendYieldChart.tsx'
    Content = @'
import { List, Typography } from 'antd'
import type { HistoricalYieldPointDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function DividendYieldChart({ items }: { items: HistoricalYieldPointDto[] }) {
  return (
    <AppCard>
      <Typography.Title level={5}>Natural Year Dividend Yield</Typography.Title>
      <List
        dataSource={items}
        renderItem={(item) => (
          <List.Item>
            {item.year}: {percent.format(item.yield)} / {item.events} events
          </List.Item>
        )}
      />
    </AppCard>
  )
}
'@
  },
  @{
    Path = 'src/renderer/src/containers/StockDetailContainer.tsx'
    Content = @'
import { Alert, Col, Row, Skeleton, Typography } from 'antd'
import { useStockDetail } from '@renderer/hooks/useStockDetail'
import { DividendYieldChart } from '@renderer/features/stock-detail/components/DividendYieldChart'
import { FutureYieldEstimateCard } from '@renderer/features/stock-detail/components/FutureYieldEstimateCard'
import { AppCard } from '@renderer/components/app/AppCard'

export function StockDetailContainer({ symbol }: { symbol: string }) {
  const { data, loading, error } = useStockDetail(symbol)

  if (loading) {
    return <Skeleton active paragraph={{ rows: 8 }} />
  }

  if (error || !data) {
    return <Alert type="error" message={error ?? 'Stock detail not found'} />
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <AppCard>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            {data.name} ({data.symbol})
          </Typography.Title>
          <Typography.Text type="secondary">{data.industry ?? 'Unknown Industry'} / A Share</Typography.Text>
        </AppCard>
      </Col>
      <Col xs={24} xl={12}>
        <DividendYieldChart items={data.yearlyYields} />
      </Col>
      <Col xs={24} xl={12}>
        <FutureYieldEstimateCard estimate={data.futureYieldEstimate} />
      </Col>
    </Row>
  )
}
'@
  },
  @{
    Path = 'src/renderer/src/pages/StockDetailPage.tsx'
    Content = @'
import { Layout } from 'antd'
import { StockDetailContainer } from '@renderer/containers/StockDetailContainer'

export function StockDetailPage() {
  return (
    <Layout.Content style={{ padding: 24 }}>
      <StockDetailContainer symbol="600519" />
    </Layout.Content>
  )
}
'@
  },
  @{
    Path = 'src/renderer/src/App.tsx'
    Content = @'
import { Layout, Typography } from 'antd'
import { StockDetailPage } from '@renderer/pages/StockDetailPage'

export default function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          DividendMonitor
        </Typography.Title>
      </Layout.Header>
      <StockDetailPage />
    </Layout>
  )
}
'@
  },
  @{
    Path = 'src/renderer/src/main.tsx'
    Content = @'
import React from 'react'
import ReactDOM from 'react-dom/client'
import 'antd/dist/reset.css'
import App from '@renderer/App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
'@
  }
)

foreach ($file in $files) {
  $directory = Split-Path -Parent $file.Path
  if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  Set-Content -Path $file.Path -Value $file.Content -Encoding UTF8
}
