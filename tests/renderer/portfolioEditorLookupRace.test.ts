import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssetSearchItemDto } from '@shared/contracts/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type InputEvents = { onBlur?: () => Promise<void>; onChange?: () => void }
const boundary = vi.hoisted(() => ({
  fields: {} as Record<string, unknown>,
  inputs: new Map<string, InputEvents>(),
  confirm: undefined as (() => Promise<void>) | undefined
}))

// 替代无DOM环境里的Form控件边界，异步查找及输入事件处理仍运行真实Modal代码。
vi.mock('antd', async () => {
  const { createElement, cloneElement, forwardRef, Fragment } = await import('react')
  const Form = Object.assign(({ children }: { children?: import('react').ReactNode }) => createElement(Fragment, null, children), {
    useForm: () => [{
      getFieldValue: (key: string) => boundary.fields[key],
      setFieldsValue: (values: Record<string, unknown>) => Object.assign(boundary.fields, values),
      validateFields: async () => ({ ...boundary.fields })
    }],
    useWatch: (key: string) => boundary.fields[key],
    Item: ({ name, children }: { name?: string; children: import('react').ReactElement<{ __fieldName?: string }> }) =>
      name ? cloneElement(children, { __fieldName: name }) : children
  })
  return {
    Form,
    Input: forwardRef<unknown, InputEvents & { __fieldName?: string }>((props, _ref) => {
      if (props.__fieldName) boundary.inputs.set(props.__fieldName, props)
      return null
    }),
    InputNumber: () => null,
    Select: () => null,
    Modal: ({ children, onOk }: { children?: import('react').ReactNode; onOk: () => Promise<void> }) => {
      boundary.confirm = onOk
      return createElement(Fragment, null, children)
    },
    message: { useMessage: () => [{ error: () => {} }, null] }
  }
})
vi.mock('@renderer/hooks/useSettings', () => ({ useSettings: () => ({ settings: null }) }))
vi.mock('@renderer/components/app/AppDatePicker', () => ({ AppDatePicker: () => null }))

import { PortfolioPositionEditorModal, type PortfolioEditorSubmitValues } from '@renderer/components/dashboard/PortfolioPositionEditorModal'

describe('持仓名称识别请求竞态', () => {
  beforeEach(() => {
    boundary.fields = { assetKey: '', code: '', name: '黄金99.99', shares: 100, avgCost: 10 }
    boundary.inputs.clear()
    boundary.confirm = undefined
  })

  it('名称反查未完成时继续修改名称，旧结果不能覆盖新输入或回填旧代码', async () => {
    let complete!: (results: AssetSearchItemDto[]) => void
    const pending = new Promise<AssetSearchItemDto[]>((resolve) => { complete = resolve })
    renderToStaticMarkup(createElement(PortfolioPositionEditorModal, {
      open: true, mode: 'create', initialValues: { shares: 100, avgCost: 10 },
      onCancel: () => {}, onSubmit: () => {}, assetApi: { search: () => pending }
    }))
    const lookup = boundary.inputs.get('name')!.onBlur!()
    boundary.fields.name = '白银99.99'
    boundary.inputs.get('name')!.onChange?.()
    complete([{ assetKey: 'GOLD:SGE:AU9999', assetType: 'GOLD', market: 'SGE', code: 'AU9999', name: '黄金99.99' }])
    await lookup
    expect(boundary.fields.name).toBe('白银99.99')
    expect(boundary.fields.code).toBe('')
    expect(boundary.fields.assetKey).toBe('')
  })

  it('已有代码和身份时修改名称作为别名，保留已确认身份', () => {
    Object.assign(boundary.fields, { assetKey: 'GOLD:SGE:AU9999', assetType: 'GOLD', market: 'SGE', code: 'AU9999' })
    renderToStaticMarkup(createElement(PortfolioPositionEditorModal, {
      open: true, mode: 'edit', initialValues: { shares: 100, avgCost: 10 },
      onCancel: () => {}, onSubmit: () => {}, assetApi: { search: async () => [] }
    }))
    boundary.fields.name = '我的黄金'
    boundary.inputs.get('name')!.onChange?.()
    expect(boundary.fields).toMatchObject({ name: '我的黄金', assetKey: 'GOLD:SGE:AU9999', assetType: 'GOLD', market: 'SGE', code: 'AU9999' })
  })

  it('真实表单仅修改旧记录日期时提交原成本，保持未知成交价为空', async () => {
    Object.assign(boundary.fields, {
      assetKey: 'STOCK:A_SHARE:601398', assetType: 'STOCK', market: 'A_SHARE', code: '601398',
      name: '工商银行', shares: 100, avgCost: 10.05, direction: 'BUY', openedAt: '2026-10-25'
    })
    let saved: PortfolioEditorSubmitValues | undefined
    renderToStaticMarkup(createElement(PortfolioPositionEditorModal, {
      open: true, mode: 'edit', initialValues: { shares: 100, avgCost: 10.05, originalAvgCost: 10.05, openedAt: '2026-10-20' },
      onCancel: () => {}, onSubmit: (values) => { saved = values }, assetApi: { search: async () => [] }
    }))
    await boundary.confirm!()
    expect(saved).toMatchObject({ avgCost: 10.05, shares: 100, openedAt: '2026-10-25' })
    expect(saved?.tradePrice).toBeUndefined()
  })

  it.each([
    { direction: 'BUY' as const, amount: 325 },
    { direction: 'SELL' as const, amount: 315 }
  ])('真实表单提交$direction交易100份×3.2元时保存现金流$amount元', async ({ direction, amount }) => {
    Object.assign(boundary.fields, {
      assetKey: 'ETF:A_SHARE:510880', assetType: 'ETF', market: 'A_SHARE', code: '510880',
      name: '红利ETF', shares: 100, avgCost: 3.2, direction
    })
    let saved: PortfolioEditorSubmitValues | undefined
    renderToStaticMarkup(createElement(PortfolioPositionEditorModal, {
      open: true, mode: 'create', initialValues: { shares: 100, avgCost: 3.2 },
      onCancel: () => {}, onSubmit: (values) => { saved = values }, assetApi: { search: async () => [] }
    }))
    await boundary.confirm!()
    expect(saved?.avgCost! * saved?.shares!).toBe(amount)
    expect(saved).toMatchObject({ direction, tradePrice: 3.2 })
  })
})
