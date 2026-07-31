import type { DividendEvent } from '@main/domain/entities/Stock'

export function mapAssignProgressToStatus(raw: string | null | undefined): DividendEvent['status'] {
  if (!raw || raw.trim() === '') return 'PLANNED'
  if (raw.includes('实施')) return 'IMPLEMENTED'
  if (raw.includes('预案')) return 'PLANNED'
  return 'IN_PROGRESS'
}