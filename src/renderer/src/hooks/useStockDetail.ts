import type { StockDetailDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/stockApi'
import { useFetch } from '@renderer/hooks/useFetch'

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol.trim())
}

export function useStockDetail(symbol: string) {
  const { data, loading, error } = useFetch<StockDetailDto | null>(
    async () => {
      if (!isAShareSymbol(symbol)) {
        throw new Error(`仅支持A股6位代码，当前代码无效：${symbol}`)
      }
      return stockApi.getDetail(symbol)
    },
    [symbol]
  )

  return { data, loading, error }
}
