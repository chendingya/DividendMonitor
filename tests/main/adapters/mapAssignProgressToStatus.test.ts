import { describe, it, expect } from 'vitest'
import { mapAssignProgressToStatus } from '@main/adapters/eastmoney/mapAssignProgressToStatus'

describe('mapAssignProgressToStatus', () => {
  it('实施 → IMPLEMENTED', () => {
    expect(mapAssignProgressToStatus('实施')).toBe('IMPLEMENTED')
    expect(mapAssignProgressToStatus('实施分配')).toBe('IMPLEMENTED')
  })
  it('停止实施/停止预案 → 非 IMPLEMENTED', () => {
    expect(mapAssignProgressToStatus('停止实施')).toBe('IN_PROGRESS')
    expect(mapAssignProgressToStatus('停止预案')).toBe('IN_PROGRESS')
  })
  it('预案 → PLANNED', () => {
    expect(mapAssignProgressToStatus('董事会预案')).toBe('PLANNED')
    expect(mapAssignProgressToStatus('预案')).toBe('PLANNED')
  })
  it('其他状态 → IN_PROGRESS', () => {
    expect(mapAssignProgressToStatus('股东大会通过')).toBe('IN_PROGRESS')
    expect(mapAssignProgressToStatus('董事会通过')).toBe('IN_PROGRESS')
    expect(mapAssignProgressToStatus('批准')).toBe('IN_PROGRESS')
  })
  it('空输入兜底为 PLANNED', () => {
    expect(mapAssignProgressToStatus(null)).toBe('PLANNED')
    expect(mapAssignProgressToStatus(undefined)).toBe('PLANNED')
    expect(mapAssignProgressToStatus('')).toBe('PLANNED')
  })
})