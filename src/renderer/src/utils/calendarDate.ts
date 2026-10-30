import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

/** 买入日是日历日期；云端旧时间戳只取日期部分，不进行时区换算。 */
export function normalizeCalendarDate(value?: string | null): string | undefined {
  const date = value?.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1]
  return date && dayjs(date, 'YYYY-MM-DD', true).isValid() ? date : undefined
}

/** 对影响恢复幂等性的可选日期做显式校验，避免非法日期被静默当成未填写。 */
export function validateOptionalCalendarDate(value: unknown, label: string): string | undefined {
  if (value == null || (typeof value === 'string' && !value.trim())) return undefined
  const date = typeof value === 'string' ? normalizeCalendarDate(value) : undefined
  if (!date) throw new Error(`${label}日期无效`)
  return date
}
