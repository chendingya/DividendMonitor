/** 买入日是日历日期；云端 TIMESTAMPTZ 只取原始日期部分，不进行时区换算。 */
export function toPortfolioCalendarDate(value: unknown): string | undefined {
  return String(value ?? '').trim().match(/^\d{4}-\d{2}-\d{2}(?=$|[T ])/u)?.[0]
}
