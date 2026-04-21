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
