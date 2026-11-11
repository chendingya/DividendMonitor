import { describe, expect, it } from 'vitest'
import type { BacktestResultDto } from '@shared/contracts/api'
import { getInsufficientCapitalHint } from '@renderer/utils/backtestCapital'

function buildResult(overrides: Partial<BacktestResultDto>): BacktestResultDto {
  return {
    symbol: '600519',
    buyPrice: 1752.42,
    finalShares: 0,
    initialCost: 0,
    ...overrides
  } as BacktestResultDto
}

describe('getInsufficientCapitalHint', () => {
  it('returns a hint with the minimum lot cost when no shares were bought', () => {
    const hint = getInsufficientCapitalHint(buildResult({}))
    expect(hint).toContain('初始资金不足一手')
    expect(hint).toContain('175,242')
  })

  it('returns null for a normal backtest result', () => {
    expect(
      getInsufficientCapitalHint(
        buildResult({ finalShares: 27800, initialCost: 100000 })
      )
    ).toBeNull()
  })

  it('returns null when the buy price is unavailable', () => {
    expect(getInsufficientCapitalHint(buildResult({ buyPrice: 0 }))).toBeNull()
  })
})
