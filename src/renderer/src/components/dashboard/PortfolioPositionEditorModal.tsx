import { Form, Input, InputNumber, message, Modal, Select } from 'antd'
import { useEffect } from 'react'
import type { StockSearchItemDto } from '@shared/contracts/api'

type StockApi = {
  search(keyword: string): Promise<StockSearchItemDto[]>
  getDetail(symbol: string): Promise<{ symbol: string; name: string }>
}

export type PortfolioEditorMode = 'create' | 'edit'

export type PortfolioEditorInitialValues = {
  symbol?: string
  name?: string
  direction?: 'BUY' | 'SELL'
  shares: number
  avgCost: number
}

export type PortfolioEditorSubmitValues = {
  symbol?: string
  name: string
  direction: 'BUY' | 'SELL'
  shares: number
  avgCost: number
}

type Props = {
  open: boolean
  mode: PortfolioEditorMode
  initialValues: PortfolioEditorInitialValues
  lockIdentity?: boolean
  onCancel: () => void
  onSubmit: (values: PortfolioEditorSubmitValues) => Promise<void> | void
  stockApi: StockApi
}

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol.trim())
}

function pickBestSearchResult(keyword: string, results: StockSearchItemDto[]) {
  const normalized = keyword.trim()
  if (!normalized) {
    return results[0]
  }
  const exactSymbol = results.find((item) => item.symbol === normalized)
  if (exactSymbol) {
    return exactSymbol
  }
  const exactName = results.find((item) => item.name === normalized)
  if (exactName) {
    return exactName
  }
  const startsWithName = results.find((item) => item.name.startsWith(normalized))
  if (startsWithName) {
    return startsWithName
  }
  return results[0]
}

export function PortfolioPositionEditorModal({
  open,
  mode,
  initialValues,
  lockIdentity = false,
  onCancel,
  onSubmit,
  stockApi
}: Props) {
  const [apiMessage, messageHolder] = message.useMessage()
  const [form] = Form.useForm<{
    symbol?: string
    name?: string
    direction: 'BUY' | 'SELL'
    shares: number
    avgCost: number
  }>()

  useEffect(() => {
    if (!open) {
      return
    }
    form.setFieldsValue({
      symbol: initialValues.symbol ?? '',
      name: initialValues.name ?? '',
      direction: initialValues.direction ?? 'BUY',
      shares: initialValues.shares,
      avgCost: initialValues.avgCost
    })
  }, [form, initialValues, open])

  async function onSymbolBlur() {
    const symbol = form.getFieldValue('symbol')?.trim()
    const name = form.getFieldValue('name')?.trim()
    if (!symbol || name || !isAShareSymbol(symbol)) {
      return
    }
    try {
      const detail = await stockApi.getDetail(symbol)
      form.setFieldsValue({ symbol: detail.symbol, name: detail.name })
    } catch {
      try {
        const results = await stockApi.search(symbol)
        const best = pickBestSearchResult(symbol, results)
        if (best) {
          form.setFieldsValue({ symbol: best.symbol, name: best.name })
        }
      } catch {
        // ignore blur-time lookup failures
      }
    }
  }

  async function onNameBlur() {
    const symbol = form.getFieldValue('symbol')?.trim()
    const name = form.getFieldValue('name')?.trim()
    if (!name || symbol || mode === 'edit') {
      return
    }
    try {
      const results = await stockApi.search(name)
      const best = pickBestSearchResult(name, results)
      if (best) {
        form.setFieldsValue({ symbol: best.symbol, name: best.name })
      }
    } catch {
      // ignore blur-time lookup failures
    }
  }

  async function handleOk() {
    try {
      const values = await form.validateFields()
      const symbolRaw = values.symbol?.trim() ?? ''
      const nameRaw = values.name?.trim() ?? ''
      let resolvedSymbol = symbolRaw
      let resolvedName = nameRaw

      if (!resolvedSymbol && !resolvedName) {
        apiMessage.error('股票代码和名称至少填写一个')
        return
      }

      if (mode === 'create') {
        if (resolvedSymbol && !resolvedName) {
          try {
            const detail = await stockApi.getDetail(resolvedSymbol)
            resolvedSymbol = detail.symbol
            resolvedName = detail.name
            form.setFieldsValue({ symbol: detail.symbol, name: detail.name })
          } catch {
            const results = await stockApi.search(resolvedSymbol)
            const best = pickBestSearchResult(resolvedSymbol, results)
            if (best) {
              resolvedSymbol = best.symbol
              resolvedName = best.name
              form.setFieldsValue({ symbol: best.symbol, name: best.name })
            } else {
              resolvedName = resolvedSymbol
              apiMessage.warning('未匹配到标准股票名称，已按代码保存，可后续编辑修正。')
            }
          }
        }

        if (!resolvedSymbol && resolvedName) {
          try {
            const results = await stockApi.search(resolvedName)
            const best = pickBestSearchResult(resolvedName, results)
            if (best) {
              resolvedSymbol = best.symbol
              resolvedName = best.name
              form.setFieldsValue({ symbol: best.symbol, name: best.name })
            } else {
              apiMessage.error('未能根据名称匹配股票代码，请补充代码或更换名称')
              return
            }
          } catch {
            apiMessage.error('名称反查代码失败，请稍后重试或直接填写代码')
            return
          }
        }
      }

      await onSubmit({
        symbol: resolvedSymbol || undefined,
        name: resolvedName || (mode === 'edit' ? initialValues.name ?? '未命名标的' : `无代码资产-${new Date().toISOString().slice(0, 10)}`),
        direction: values.direction,
        shares: values.shares,
        avgCost: values.avgCost
      })
    } catch (error) {
      if (error instanceof Error) {
        apiMessage.error(error.message)
      }
    }
  }

  return (
    <Modal open={open} title={mode === 'edit' ? '编辑持仓' : '添加资产'} onCancel={onCancel} onOk={handleOk} okText={mode === 'edit' ? '保存修改' : '添加'}>
      {messageHolder}
      <Form form={form} layout="vertical">
        {mode === 'create' ? (
          <Form.Item label="交易方向" name="direction" rules={[{ required: true, message: '请选择交易方向' }]}>
            <Select
              options={[
                { label: '买入（增加持仓）', value: 'BUY' },
                { label: '卖出（减少持仓）', value: 'SELL' }
              ]}
            />
          </Form.Item>
        ) : null}
        <Form.Item
          label="股票代码"
          name="symbol"
          rules={[
            {
              validator: async (_, value: string | undefined) => {
                const raw = value?.trim()
                if (!raw) {
                  return
                }
                if (!isAShareSymbol(raw)) {
                  throw new Error('若填写代码，仅支持 A 股 6 位代码')
                }
              }
            }
          ]}
        >
          <Input
            placeholder={mode === 'edit' ? '编辑模式下股票代码不可修改' : '可选，例如 600519；不填则可通过名称自动反查'}
            onBlur={mode === 'create' ? onSymbolBlur : undefined}
            disabled={mode === 'edit'}
          />
        </Form.Item>
        <Form.Item label="股票名称" name="name">
          <Input
            placeholder={mode === 'edit' ? '编辑模式下股票名称不可修改' : '可选，例如 贵州茅台；可自动反查代码'}
            onBlur={mode === 'create' ? onNameBlur : undefined}
            disabled={mode === 'edit' && lockIdentity}
          />
        </Form.Item>
        <Form.Item label="持仓股数" name="shares" rules={[{ required: true, message: '请输入持仓股数' }]}>
          <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="持仓成本价" name="avgCost" rules={[{ required: true, message: '请输入成本价' }]}>
          <InputNumber min={0.01} precision={4} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
