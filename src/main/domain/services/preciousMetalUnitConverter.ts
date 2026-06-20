export type PreciousMetalUnit = 'gram' | 'ounce'

export type PreciousMetalCurrency = 'CNY' | 'USD'

export const TROY_OUNCE_GRAMS = 31.1035

export type PreciousMetalDisplaySetting = {
  unit: PreciousMetalUnit
  currency: PreciousMetalCurrency
  usdCnyRate: number
}

export function gramsToOunces(grams: number): number {
  return grams / TROY_OUNCE_GRAMS
}

export function ouncesToGrams(ounces: number): number {
  return ounces * TROY_OUNCE_GRAMS
}

export function convertPreciousMetalPrice(
  priceCnyPerGram: number,
  setting: PreciousMetalDisplaySetting
): number {
  if (setting.currency === 'CNY') {
    return setting.unit === 'ounce'
      ? priceCnyPerGram * TROY_OUNCE_GRAMS
      : priceCnyPerGram
  }

  const priceUsdPerGram = priceCnyPerGram / setting.usdCnyRate
  return setting.unit === 'ounce'
    ? priceUsdPerGram * TROY_OUNCE_GRAMS
    : priceUsdPerGram
}

export function formatPreciousMetalUnit(unit: PreciousMetalUnit): string {
  return unit === 'ounce' ? '盎司' : '克'
}

export function formatPreciousMetalCurrency(currency: PreciousMetalCurrency): string {
  return currency === 'USD' ? '美元' : '人民币'
}

export function buildPreciousMetalPriceLabel(setting: PreciousMetalDisplaySetting): string {
  return `${formatPreciousMetalCurrency(setting.currency)} / ${formatPreciousMetalUnit(setting.unit)}`
}
