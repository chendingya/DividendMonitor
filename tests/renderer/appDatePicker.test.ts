import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type PickerBoundary = {
  value: Dayjs | null
  onChange: (value: Dayjs | null) => void
}
const boundary = vi.hoisted(() => ({ props: null as PickerBoundary | null }))

// 无DOM测试环境中仅代替日历UI；字符串/Dayjs转换仍由真实AppDatePicker执行。
vi.mock('antd', () => ({
  DatePicker: (props: PickerBoundary) => {
    boundary.props = props
    return null
  }
}))
vi.mock('@renderer/hooks/useIsMobile', () => ({ useIsMobile: () => true }))

import { AppDatePicker } from '@renderer/components/app/AppDatePicker'

describe('AppDatePicker表单字符串边界', () => {
  beforeEach(() => { boundary.props = null })

  it('保留默认日期和云端旧ISO日期的日历日，不受时区偏移影响', () => {
    renderToStaticMarkup(createElement(AppDatePicker, { value: '2026-10-20T23:00:00-08:00' }))
    expect(boundary.props?.value?.format('YYYY-MM-DD')).toBe('2026-10-20')
    renderToStaticMarkup(createElement(AppDatePicker, { value: '2026-01-01' }))
    expect(boundary.props?.value?.format('YYYY-MM-DD')).toBe('2026-01-01')
  })

  it('选择新日期后向Form/API回写日期字符串，重新传入仍可编辑', () => {
    let formValue: string | undefined = '2026-10-20'
    const onChange = (value: string | undefined) => { formValue = value }
    renderToStaticMarkup(createElement(AppDatePicker, { value: formValue, onChange }))
    boundary.props!.onChange(dayjs('2026-10-23'))
    expect(formValue).toBe('2026-10-23')
    renderToStaticMarkup(createElement(AppDatePicker, { value: formValue, onChange }))
    expect(boundary.props?.value?.format('YYYY-MM-DD')).toBe('2026-10-23')
  })

  it('清除可选买入日期回写undefined，并显示空日历值', () => {
    let formValue: string | undefined = '2026-10-20'
    const onChange = (value: string | undefined) => { formValue = value }
    renderToStaticMarkup(createElement(AppDatePicker, { value: formValue, onChange }))
    boundary.props!.onChange(null)
    expect(formValue).toBeUndefined()
    renderToStaticMarkup(createElement(AppDatePicker, { value: formValue, onChange }))
    expect(boundary.props?.value).toBeNull()
  })

  it.each(['2026-02-30', 'invalid', '', undefined])('无效或空存量日期%s不产生错误或悄悄滚动到下个月', (value) => {
    renderToStaticMarkup(createElement(AppDatePicker, { value }))
    expect(boundary.props?.value).toBeNull()
  })
})
