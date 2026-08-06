import { describe, expect, it } from 'vitest'
import { deriveDividendType, formatUpdatedAtLabel } from '@renderer/utils/format'

describe('deriveDividendType', () => {
  it('returns 现金分红 for cash-only events', () => {
    expect(deriveDividendType({ dividendPerShare: 2.26 })).toBe('现金分红')
  })

  it('returns 现金+送转 when bonus shares are present', () => {
    expect(deriveDividendType({ dividendPerShare: 1.0, bonusSharePer10: 4 })).toBe('现金+送转')
  })

  it('returns 现金+送转 when transfer shares are present', () => {
    expect(deriveDividendType({ dividendPerShare: 0.5, transferSharePer10: 2 })).toBe('现金+送转')
  })

  it('returns 送转 for events without cash', () => {
    expect(deriveDividendType({ dividendPerShare: 0, bonusSharePer10: 3 })).toBe('送转')
  })

  it('returns 常规 when nothing applies', () => {
    expect(deriveDividendType({ dividendPerShare: 0 })).toBe('常规')
  })

  it('ignores undefined optional fields', () => {
    expect(deriveDividendType({ dividendPerShare: 1.2, bonusSharePer10: undefined, transferSharePer10: undefined })).toBe('现金分红')
  })
})

describe('formatUpdatedAtLabel', () => {
  it('返回「更新于」短语', () => {
    expect(formatUpdatedAtLabel('2026-08-05T10:01:18.000Z')).toMatch(/^更新于 2026-08-05/)
  })

  it('undefined 时返回 null', () => {
    expect(formatUpdatedAtLabel(undefined)).toBeNull()
  })

  it('空字符串时返回 null', () => {
    expect(formatUpdatedAtLabel('')).toBeNull()
  })

  it('非法日期字符串时返回 null', () => {
    expect(formatUpdatedAtLabel('not-a-date')).toBeNull()
  })
})
