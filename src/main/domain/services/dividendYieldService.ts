import type { DividendEvent } from '@main/domain/entities/Stock'

export const NATURAL_YEAR_YIELD_BASIS =
  'Event-level yield accumulation by ex-dividend year, using dividend per share divided by the close before the record date or a source-provided equivalent reference price'

export function buildHistoricalYields(events: DividendEvent[]) {
  const grouped = new Map<number, { year: number; yield: number; events: number }>()

  for (const event of events) {
    const current = grouped.get(event.year) ?? { year: event.year, yield: 0, events: 0 }
    const eventYield = event.referenceClosePrice > 0 ? event.dividendPerShare / event.referenceClosePrice : 0

    current.yield += eventYield
    current.events += 1
    grouped.set(event.year, current)
  }

  return [...grouped.values()].sort((a, b) => a.year - b.year)
}
