import type { AssetBacktestRequestDto, BacktestResultDto } from '@shared/contracts/api'
import { calculationApi } from '@renderer/services/calculationApi'
import { useFetch } from '@renderer/hooks/useFetch'

export type BacktestParams = {
  assetKey: string | null
  buyDate: string
  initialCapital?: number
  includeFees?: boolean
  feeRate?: number
  stampDutyRate?: number
  minCommission?: number
  dcaEnabled?: boolean
  dcaFrequency?: 'monthly' | 'quarterly' | 'yearly'
  dcaAmount?: number
  benchmarkSymbol?: string
}

export function useAssetBacktest(params: BacktestParams) {
  const { data, loading, error } = useFetch<BacktestResultDto | null>(
    async () => {
      if (!params.assetKey) {
        return null
      }

      const request: AssetBacktestRequestDto = {
        asset: { assetKey: params.assetKey },
        buyDate: params.buyDate,
        initialCapital: params.initialCapital,
        includeFees: params.includeFees,
        feeRate: params.feeRate,
        stampDutyRate: params.stampDutyRate,
        minCommission: params.minCommission,
        benchmarkSymbol: params.benchmarkSymbol || undefined
      }

      if (params.dcaEnabled && params.dcaAmount && params.dcaFrequency) {
        request.dcaConfig = {
          enabled: true,
          frequency: params.dcaFrequency,
          amount: params.dcaAmount
        }
      }

      return calculationApi.runDividendReinvestmentBacktestForAsset(request)
    },
    [
      params.assetKey,
      params.buyDate,
      params.initialCapital,
      params.includeFees,
      params.feeRate,
      params.stampDutyRate,
      params.minCommission,
      params.dcaEnabled,
      params.dcaFrequency,
      params.dcaAmount,
      params.benchmarkSymbol
    ]
  )

  return { data, loading, error }
}
