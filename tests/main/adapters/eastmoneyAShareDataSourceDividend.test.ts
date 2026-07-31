import { describe, it, expect } from 'vitest'
import { mapDividendRecordsToEvents } from '@main/adapters/eastmoney/eastmoneyAShareDataSource'
import type { StockDividendRecord } from '@main/infrastructure/dataSources/types/sourceTypes'

describe('mapDividendRecordsToEvents', () => {
  it('保留非实施记录并给 status 与 announcementProgress', () => {
    const records: StockDividendRecord[] = [
      {
        SECURITY_CODE: '600519',
        REPORT_DATE: '2025-12-31',
        PLAN_NOTICE_DATE: '2025-04-01',
        PRETAX_BONUS_RMB: 5,
        DIVIDENT_RATIO: 12,
        ASSIGN_PROGRESS: '实施',
        EX_DIVIDEND_DATE: '2025-07-01',
        BONUS_RATIO: 0,
        BONUS_IT_RATIO: 0
      },
      {
        SECURITY_CODE: '600519',
        REPORT_DATE: '2026-12-31',
        PLAN_NOTICE_DATE: '2026-04-15',
        PRETAX_BONUS_RMB: 5,
        ASSIGN_PROGRESS: '董事会预案'
      },
      {
        SECURITY_CODE: '600519',
        REPORT_DATE: '2026-12-31',
        PLAN_NOTICE_DATE: '2026-06-01',
        ASSIGN_PROGRESS: '股东大会通过',
        PRETAX_BONUS_RMB: 5
      }
    ]

    const events = mapDividendRecordsToEvents(records, { fallbackPrice: 1500 })

    expect(events).toHaveLength(3)

    const implemented = events.find((e) => e.status === 'IMPLEMENTED')
    const planned = events.find((e) => e.status === 'PLANNED')
    const inProgress = events.find((e) => e.status === 'IN_PROGRESS')

    expect(implemented).toBeTruthy()
    expect(planned).toBeTruthy()
    expect(inProgress).toBeTruthy()

    expect(implemented?.exDate).toBe('2025-07-01')
    expect(planned?.exDate).toBeUndefined()
    expect(inProgress?.exDate).toBeUndefined()

    expect(implemented?.announcementProgress).toBe('实施')
    expect(planned?.announcementProgress).toBe('董事会预案')
    expect(inProgress?.announcementProgress).toBe('股东大会通过')

    expect(planned?.announceDate).toBe('2026-04-15')
    expect(inProgress?.announceDate).toBe('2026-06-01')
  })

  it('过滤掉没有现金分红也没有送转的记录', () => {
    const records: StockDividendRecord[] = [
      {
        SECURITY_CODE: '600519',
        REPORT_DATE: '2024-12-31',
        ASSIGN_PROGRESS: '董事会预案',
        PRETAX_BONUS_RMB: 0,
        BONUS_RATIO: 0,
        BONUS_IT_RATIO: 0
      }
    ]
    const events = mapDividendRecordsToEvents(records, { fallbackPrice: 100 })
    expect(events).toHaveLength(0)
  })

  it('referenceClosePrice 缺失且无派息率时用 fallbackPrice', () => {
    const records: StockDividendRecord[] = [
      {
        SECURITY_CODE: '600519',
        REPORT_DATE: '2025-12-31',
        PLAN_NOTICE_DATE: '2025-04-01',
        EX_DIVIDEND_DATE: '2025-07-01',
        PRETAX_BONUS_RMB: 5,
        ASSIGN_PROGRESS: '实施'
      }
    ]
    const events = mapDividendRecordsToEvents(records, { fallbackPrice: 1500 })
    expect(events[0].referenceClosePrice).toBe(1500)
  })
})