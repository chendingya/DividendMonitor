import { createAShareDataSource } from '@main/adapters'
import type { AShareDataSource, CoreStockDetailSource, StockDetailSource, StockValuationSource } from '@main/adapters/contracts'
import { ValuationRepository } from '@main/repositories/valuationRepository'

const sharedValuationRepository = new ValuationRepository()

function mergeStockDetail(source: CoreStockDetailSource, valuation?: StockValuationSource): StockDetailSource {
  return {
    ...source,
    stock: {
      ...source.stock,
      peRatio: valuation?.pe?.currentValue ?? source.stock.peRatio,
      pbRatio: valuation?.pb?.currentValue ?? source.stock.pbRatio
    },
    valuation
  }
}

export class StockRepository {
  constructor(
    private readonly dataSource: AShareDataSource = createAShareDataSource(),
    private readonly valuationRepository: ValuationRepository = sharedValuationRepository
  ) {}

  async search(keyword: string) {
    return this.dataSource.search(keyword)
  }

  async getDetail(symbol: string): Promise<StockDetailSource> {
    const [source, valuation] = await Promise.all([
      this.dataSource.getDetail(symbol),
      this.valuationRepository.getStockValuation(symbol)
    ])

    return mergeStockDetail(source, valuation)
  }

  async compare(symbols: string[]): Promise<StockDetailSource[]> {
    const [sources, valuations] = await Promise.all([
      this.dataSource.compare(symbols),
      Promise.all(symbols.map((symbol) => this.valuationRepository.getStockValuation(symbol)))
    ])

    return sources.map((source, index) => mergeStockDetail(source, valuations[index]))
  }
}

