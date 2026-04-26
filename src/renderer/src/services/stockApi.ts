import type { AssetComparisonRowDto, AssetDetailDto, AssetSearchItemDto, ComparisonRowDto, StockDetailDto, StockSearchItemDto } from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { assetApi } from '@renderer/services/assetApi'

function assertStockSearchItems(items: AssetSearchItemDto[]): StockSearchItemDto[] {
  return items.map((item) => {
    if (item.assetType !== 'STOCK' || !item.symbol) {
      throw new Error(`Expected STOCK search result but received ${item.assetType}:${item.code}`)
    }

    return {
      ...item,
      assetType: 'STOCK',
      symbol: item.symbol
    }
  })
}

function assertStockDetail(detail: AssetDetailDto): StockDetailDto {
  if (detail.assetType !== 'STOCK' || !detail.symbol) {
    throw new Error(`Expected STOCK detail but received ${detail.assetType}:${detail.code}`)
  }

  return {
    ...detail,
    assetType: 'STOCK',
    symbol: detail.symbol
  }
}

function assertStockComparisonRows(rows: AssetComparisonRowDto[]): ComparisonRowDto[] {
  return rows.map((item) => {
    if (item.assetType !== 'STOCK' || !item.symbol) {
      throw new Error(`Expected STOCK comparison row but received ${item.assetType}:${item.code}`)
    }

    return {
      ...item,
      assetType: 'STOCK',
      symbol: item.symbol
    }
  })
}

export const stockApi = {
  async search(keyword: string): Promise<StockSearchItemDto[]> {
    const items = await assetApi.search({
      keyword,
      assetTypes: ['STOCK']
    })
    return assertStockSearchItems(items)
  },
  async getDetail(symbol: string): Promise<StockDetailDto> {
    return assertStockDetail(await assetApi.getDetail(createStockAssetQuery(symbol)))
  },
  async compare(symbols: string[]): Promise<ComparisonRowDto[]> {
    const rows = await assetApi.compare({
      items: symbols.map((symbol) => createStockAssetQuery(symbol))
    })
    return assertStockComparisonRows(rows)
  }
}

