import type { BacktestResultDto } from '@shared/contracts/api'
import { calculationApi } from '@renderer/services/calculationApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useBacktest(symbol: string, buyDate: string) {
  const { data, loading, error } = useFetch<BacktestResultDto>(
    () => calculationApi.runDividendReinvestmentBacktest(symbol, buyDate),
    [symbol, buyDate]
  )

  return { data, loading, error }
}
