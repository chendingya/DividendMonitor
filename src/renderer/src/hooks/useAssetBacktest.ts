import { useEffect, useState } from 'react'
import type { AssetBacktestRequestDto, BacktestResultDto } from '@shared/contracts/api'
import { calculationApi } from '@renderer/services/calculationApi'

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
  const [data, setData] = useState<BacktestResultDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      if (!params.assetKey) {
        if (!disposed) {
          setData(null)
          setLoading(false)
        }
        return
      }

      try {
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

        const result = await calculationApi.runDividendReinvestmentBacktestForAsset(request)
        if (!disposed) {
          setData(result)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to run backtest')
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
  }, [
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
  ])

  return { data, loading, error }
}
