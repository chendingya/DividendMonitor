import type { StockSearchItemDto } from '@shared/contracts/api'
import { StockRepository } from '@main/repositories/stockRepository'

export async function searchStocks(keyword: string): Promise<StockSearchItemDto[]> {
  const repository = new StockRepository()
  return repository.search(keyword)
}
