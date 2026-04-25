import { createAShareDataSource } from '@main/adapters'
import type { AShareDataSource, StockDetailSource } from '@main/adapters/AShareDataSource'

export class StockRepository {
  constructor(private readonly dataSource: AShareDataSource = createAShareDataSource()) {}

  async search(keyword: string) {
    return this.dataSource.search(keyword)
  }

  async getDetail(symbol: string): Promise<StockDetailSource> {
    return this.dataSource.getDetail(symbol)
  }

  async compare(symbols: string[]): Promise<StockDetailSource[]> {
    return this.dataSource.compare(symbols)
  }
}

