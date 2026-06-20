import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SettingsDto } from '@shared/contracts/api'
import { fetchSettings, updateSettings } from '@renderer/services/settingsApi'
import { getFxDesktopApi } from '@renderer/services/desktopApi'

type PreciousMetalUnit = 'gram' | 'ounce'
type PreciousMetalCurrency = 'CNY' | 'USD'

type PreciousMetalDisplayContextValue = {
  unit: PreciousMetalUnit
  currency: PreciousMetalCurrency
  usdCnyRate: number
  rateLoading: boolean
  setUnit: (unit: PreciousMetalUnit) => Promise<void>
  setCurrency: (currency: PreciousMetalCurrency) => Promise<void>
  formatPrice: (prices: { sgePriceCnyPerGram: number; internationalPriceUsdPerOz?: number }) => string
  priceLabel: string
}

const defaultContextValue: PreciousMetalDisplayContextValue = {
  unit: 'gram',
  currency: 'CNY',
  usdCnyRate: 7.2,
  rateLoading: false,
  setUnit: async () => {},
  setCurrency: async () => {},
  formatPrice: ({ sgePriceCnyPerGram }) => sgePriceCnyPerGram.toFixed(2),
  priceLabel: '人民币 / 克'
}

const PreciousMetalDisplayContext = createContext<PreciousMetalDisplayContextValue>(defaultContextValue)

const TROY_OUNCE_GRAMS = 31.1035

function formatCurrencyValue(value: number | undefined, currency: PreciousMetalCurrency): string {
  if (value == null || !Number.isFinite(value)) return '--'
  if (currency === 'USD') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function currencySymbol(currency: PreciousMetalCurrency): string {
  return currency === 'USD' ? '$' : '¥'
}

function unitLabel(unit: PreciousMetalUnit): string {
  return unit === 'ounce' ? '盎司' : '克'
}

export function PreciousMetalDisplayProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<PreciousMetalUnit>('gram')
  const [currency, setCurrencyState] = useState<PreciousMetalCurrency>('CNY')
  const [usdCnyRate, setUsdCnyRate] = useState<number>(7.2)
  const [rateLoading, setRateLoading] = useState(false)

  useEffect(() => {
    let disposed = false
    async function loadSettings() {
      try {
        const settings = await fetchSettings()
        if (disposed) return
        setUnitState(settings.preciousMetalUnit)
        setCurrencyState(settings.preciousMetalCurrency)
      } catch {
        // keep defaults
      }
    }
    void loadSettings()
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    if (currency !== 'USD') return
    let disposed = false
    async function loadRate() {
      setRateLoading(true)
      try {
        const rate = await getFxDesktopApi().getUsdCnyRate()
        if (disposed) return
        setUsdCnyRate(rate)
      } catch {
        // keep fallback
      } finally {
        if (!disposed) setRateLoading(false)
      }
    }
    void loadRate()
    return () => { disposed = true }
  }, [currency])

  async function persistSettings(partial: Partial<SettingsDto>) {
    try {
      await updateSettings(partial)
    } catch {
      // best-effort persistence
    }
  }

  async function setUnit(next: PreciousMetalUnit) {
    setUnitState(next)
    await persistSettings({ preciousMetalUnit: next })
  }

  async function setCurrency(next: PreciousMetalCurrency) {
    setCurrencyState(next)
    await persistSettings({ preciousMetalCurrency: next })
  }

  function formatPrice({ sgePriceCnyPerGram, internationalPriceUsdPerOz }: { sgePriceCnyPerGram: number; internationalPriceUsdPerOz?: number }): string {
    if (currency === 'CNY' && unit === 'gram') {
      return `¥${formatCurrencyValue(sgePriceCnyPerGram, 'CNY')}`
    }
    if (currency === 'USD' && unit === 'ounce' && internationalPriceUsdPerOz != null) {
      return `$${formatCurrencyValue(internationalPriceUsdPerOz, 'USD')}`
    }
    // Fallback conversions
    let value = sgePriceCnyPerGram
    if (currency === 'USD') {
      value = value / usdCnyRate
    }
    if (unit === 'ounce') {
      value = value * TROY_OUNCE_GRAMS
    }
    return `${currencySymbol(currency)}${formatCurrencyValue(value, currency)}`
  }

  const priceLabel = `${currency === 'USD' ? '美元' : '人民币'} / ${unitLabel(unit)}`

  const value = useMemo<PreciousMetalDisplayContextValue>(
    () => ({ unit, currency, usdCnyRate, rateLoading, setUnit, setCurrency, formatPrice, priceLabel }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unit, currency, usdCnyRate, rateLoading, priceLabel]
  )

  return <PreciousMetalDisplayContext.Provider value={value}>{children}</PreciousMetalDisplayContext.Provider>
}

export function usePreciousMetalDisplay(): PreciousMetalDisplayContextValue {
  return useContext(PreciousMetalDisplayContext)
}
