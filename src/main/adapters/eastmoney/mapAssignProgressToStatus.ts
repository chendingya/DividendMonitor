import type { DividendEvent } from '@main/domain/entities/Stock'

export function mapAssignProgressToStatus(raw: string | null | undefined): DividendEvent['status'] {
  if (!raw || raw.trim() === '') return 'PLANNED'
  // "停止实施"/"停止预案"表示方案已取消，不应计入已派发分红。
  if (raw.includes('停止')) return 'IN_PROGRESS'
  if (raw.includes('实施')) return 'IMPLEMENTED'
  if (raw.includes('预案')) return 'PLANNED'
  return 'IN_PROGRESS'
}