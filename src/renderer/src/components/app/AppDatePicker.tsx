import { DatePicker } from 'antd'
import type { DatePickerProps } from 'antd'
import dayjs from 'dayjs'
import { useIsMobile } from '@renderer/hooks/useIsMobile'
import { normalizeCalendarDate } from '@renderer/utils/calendarDate'
import './appDatePicker.css'

type Props = Omit<DatePickerProps, 'value' | 'onChange' | 'defaultValue' | 'multiple'> & {
  value?: string | null
  onChange?: (value: string | undefined) => void
}

/** 在表单/API的YYYY-MM-DD字符串与AntD日历值之间转换。 */
export function AppDatePicker({ value, onChange, className, ...props }: Props) {
  const isMobile = useIsMobile()
  const date = normalizeCalendarDate(value)
  return (
    <DatePicker
      {...props}
      className={['app-date-picker', className].filter(Boolean).join(' ')}
      classNames={{ popup: { root: 'app-date-picker-popup' } }}
      value={date ? dayjs(date) : null}
      onChange={(selected) => onChange?.(selected?.format('YYYY-MM-DD'))}
      format="YYYY-MM-DD"
      inputReadOnly={isMobile}
    />
  )
}
