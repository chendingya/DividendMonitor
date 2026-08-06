export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 生成「更新于 yyyy-MM-dd HH:mm」标签；时间缺失或不可解析时返回 null，
 * 调用方据此降级为「暂无数据」类文案，避免出现 Invalid Date。
 */
export function formatUpdatedAtLabel(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `更新于 ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export type DividendTypeSource = {
  dividendPerShare: number
  bonusSharePer10?: number
  transferSharePer10?: number
}

/** 从分红事件特征派生展示类型：现金分红 / 送转 / 现金+送转 / 常规。 */
export function deriveDividendType(event: DividendTypeSource): string {
  const hasCash = event.dividendPerShare > 0
  const hasBonus = (event.bonusSharePer10 ?? 0) > 0
  const hasTransfer = (event.transferSharePer10 ?? 0) > 0
  if (hasCash && (hasBonus || hasTransfer)) return '现金+送转'
  if (hasCash) return '现金分红'
  if (hasBonus || hasTransfer) return '送转'
  return '常规'
}
