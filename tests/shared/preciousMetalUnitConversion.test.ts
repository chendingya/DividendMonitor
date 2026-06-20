import { describe, expect, it } from 'vitest'
import {
  TROY_OUNCE_GRAMS,
  convertPreciousMetalPrice,
  gramsToOunces,
  ouncesToGrams,
  buildPreciousMetalPriceLabel
} from '@main/domain/services/preciousMetalUnitConverter'

describe('precious metal unit converter', () => {
  it('converts grams to troy ounces using 31.1035', () => {
    expect(gramsToOunces(TROY_OUNCE_GRAMS)).toBeCloseTo(1, 6)
    expect(gramsToOunces(100)).toBeCloseTo(3.215074, 4)
  })

  it('converts ounces back to grams', () => {
    expect(ouncesToGrams(1)).toBeCloseTo(TROY_OUNCE_GRAMS, 6)
    expect(ouncesToGrams(gramsToOunces(50))).toBeCloseTo(50, 6)
  })

  it('keeps CNY/gram unchanged', () => {
    expect(convertPreciousMetalPrice(920, { unit: 'gram', currency: 'CNY', usdCnyRate: 7.2 })).toBe(920)
  })

  it('converts CNY/gram to CNY/ounce', () => {
    expect(convertPreciousMetalPrice(920, { unit: 'ounce', currency: 'CNY', usdCnyRate: 7.2 })).toBeCloseTo(
      920 * TROY_OUNCE_GRAMS,
      2
    )
  })

  it('converts CNY/gram to USD/gram', () => {
    expect(convertPreciousMetalPrice(720, { unit: 'gram', currency: 'USD', usdCnyRate: 7.2 })).toBeCloseTo(100, 6)
  })

  it('converts CNY/gram to USD/ounce (international gold price convention)', () => {
    const result = convertPreciousMetalPrice(720, { unit: 'ounce', currency: 'USD', usdCnyRate: 7.2 })
    expect(result).toBeCloseTo((720 / 7.2) * TROY_OUNCE_GRAMS, 2)
  })

  it('builds display labels', () => {
    expect(buildPreciousMetalPriceLabel({ unit: 'gram', currency: 'CNY', usdCnyRate: 7.2 })).toBe('人民币 / 克')
    expect(buildPreciousMetalPriceLabel({ unit: 'ounce', currency: 'USD', usdCnyRate: 7.2 })).toBe('美元 / 盎司')
  })
})
