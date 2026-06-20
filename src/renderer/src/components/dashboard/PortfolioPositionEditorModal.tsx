import { Form, Input, InputNumber, message, Modal, Select } from 'antd'
import type { InputRef } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { AssetSearchItemDto, AssetType, MarketCode } from '@shared/contracts/api'

type AssetApi = {
  search(request: { keyword: string; assetTypes?: AssetType[] }): Promise<AssetSearchItemDto[]>
}

export type PortfolioEditorMode = 'create' | 'edit'

export type PortfolioEditorInitialValues = {
  assetKey?: string
  assetType?: AssetType
  market?: MarketCode
  code?: string
  symbol?: string
  name?: string
  direction?: 'BUY' | 'SELL'
  shares: number
  avgCost: number
}

export type PortfolioEditorSubmitValues = {
  assetKey?: string
  assetType?: AssetType
  market?: MarketCode
  code?: string
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
  onCancel: () => void
  onSubmit: (values: PortfolioEditorSubmitValues) => Promise<void> | void
  assetApi: AssetApi
}

function pickBestSearchResult(keyword: string, results: AssetSearchItemDto[]) {
  const normalized = keyword.trim()
  if (!normalized) {
    return results[0]
  }
  const exactSymbol = results.find((item) => (item.symbol ?? item.code) === normalized)
  if (exactSymbol) {
    return exactSymbol
  }
  const exactCode = results.find((item) => item.code === normalized)
  if (exactCode) {
    return exactCode
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
  onCancel,
  onSubmit,
  assetApi
}: Props) {
  const [apiMessage, messageHolder] = message.useMessage()
  const [searchingIdentity, setSearchingIdentity] = useState(false)
  const [form] = Form.useForm<{
    assetKey?: string
    assetType?: AssetType
    market?: MarketCode
    code?: string
    symbol?: string
    name?: string
    direction: 'BUY' | 'SELL'
    shares: number
    avgCost: number
  }>()
  const codeInputRef = useRef<InputRef | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    form.setFieldsValue({
      assetKey: initialValues.assetKey ?? '',
      assetType: initialValues.assetType,
      market: initialValues.market ?? 'A_SHARE',
      code: initialValues.code ?? '',
      symbol: initialValues.symbol ?? '',
      name: initialValues.name ?? '',
      direction: initialValues.direction ?? 'BUY',
      shares: initialValues.shares,
      avgCost: initialValues.avgCost
    })
    const timer = setTimeout(() => {
      if (mode === 'create') {
        codeInputRef.current?.focus()
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [form, initialValues, open, mode])

  function fillIdentity(item: AssetSearchItemDto) {
    form.setFieldsValue({
      assetKey: item.assetKey,
      assetType: item.assetType,
      market: item.market,
      code: item.code,
      symbol: item.symbol,
      name: item.name
    })
  }

  async function searchAndFill(keyword: string) {
    const normalized = keyword.trim()
    if (!normalized) {
      return null
    }
    setSearchingIdentity(true)
    try {
      const results = await assetApi.search({
        keyword: normalized,
        assetTypes: ['STOCK', 'ETF', 'FUND', 'GOLD', 'SILVER']
      })
      const best = pickBestSearchResult(normalized, results)
      if (best) {
        fillIdentity(best)
      }
      return best ?? null
    } finally {
      setSearchingIdentity(false)
    }
  }

  async function onCodeBlur() {
    const code = form.getFieldValue('code')?.trim()
    const name = form.getFieldValue('name')?.trim()
    if (!code || name) {
      return
    }
    try {
      await searchAndFill(code)
    } catch {
      // ignore blur-time lookup failures
    }
  }

  async function onNameBlur() {
    const code = form.getFieldValue('code')?.trim()
    const name = form.getFieldValue('name')?.trim()
    if (!name || code || mode === 'edit') {
      return
    }
    try {
      await searchAndFill(name)
    } catch {
      // ignore blur-time lookup failures
    }
  }

  async function handleOk() {
    try {
      const values = await form.validateFields()
      const assetKeyRaw = values.assetKey?.trim() ?? ''
      const assetType = values.assetType
      const market = values.market
      const codeRaw = values.code?.trim() ?? ''
      const symbolRaw = values.symbol?.trim() ?? ''
      const nameRaw = values.name?.trim() ?? ''
      let resolvedAssetKey = assetKeyRaw
      let resolvedAssetType = assetType
      let resolvedMarket = market
      let resolvedCode = codeRaw
      let resolvedSymbol: string | undefined = symbolRaw || undefined
      let resolvedName = nameRaw

      if (!resolvedCode && !resolvedName) {
        apiMessage.error('资产代码和名称至少填写一个')
        return
      }

      if (mode === 'create') {
        if (resolvedCode && !resolvedName) {
          try {
            const best = await searchAndFill(resolvedCode)
            if (best) {
              resolvedAssetKey = best.assetKey
              resolvedAssetType = best.assetType
              resolvedMarket = best.market
              resolvedCode = best.code
              resolvedSymbol = best.symbol ?? (best.assetType === 'STOCK' ? best.code : undefined)
              resolvedName = best.name
            }
          } catch {
            resolvedName = resolvedCode
            apiMessage.warning('未匹配到标准资产名称，已按输入代码保存，可后续编辑修正。')
          }
        }

        if (!resolvedCode && resolvedName) {
          try {
            const best = await searchAndFill(resolvedName)
            if (best) {
              resolvedAssetKey = best.assetKey
              resolvedAssetType = best.assetType
              resolvedMarket = best.market
              resolvedCode = best.code
              resolvedSymbol = best.symbol ?? (best.assetType === 'STOCK' ? best.code : undefined)
              resolvedName = best.name
            } else {
              apiMessage.error('未能根据名称匹配资产代码，请补充代码或更换名称')
              return
            }
          } catch {
            apiMessage.error('名称反查代码失败，请稍后重试或直接填写代码')
            return
          }
        }
      }

      await onSubmit({
        assetKey: resolvedAssetKey || undefined,
        assetType: resolvedAssetType,
        market: resolvedMarket,
        code: resolvedCode || undefined,
        symbol: resolvedSymbol || undefined,
        name: resolvedName || (mode === 'edit' ? initialValues.name ?? '未命名标的' : `未命名资产-${new Date().toISOString().slice(0, 10)}`),
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
        <Form.Item name="assetKey" hidden>
          <Input />
        </Form.Item>
        <Form.Item label="资产类型" name="assetType">
          <Select
            options={[
              { label: '股票 (STOCK)', value: 'STOCK' },
              { label: 'ETF', value: 'ETF' },
              { label: '基金 (FUND)', value: 'FUND' },
              { label: '黄金 (GOLD)', value: 'GOLD' },
              { label: '白银 (SILVER)', value: 'SILVER' }
            ]}
          />
        </Form.Item>
        <Form.Item label="市场" name="market">
          <Select
            options={[
              { label: 'A股 (A_SHARE)', value: 'A_SHARE' },
              { label: '上海金交所 (SGE)', value: 'SGE' }
            ]}
          />
        </Form.Item>
        <Form.Item label="交易方向" name="direction" rules={[{ required: true, message: '请选择交易方向' }]}>
          <Select
            options={[
              { label: '买入（增加持仓）', value: 'BUY' },
              { label: '卖出（减少持仓）', value: 'SELL' }
            ]}
          />
        </Form.Item>
        <Form.Item
          label="资产代码"
          name="code"
          rules={[
            {
              validator: async (_, value: string | undefined) => {
                if (!value?.trim()) return
              }
            }
          ]}
        >
          <Input
            ref={mode === 'create' ? codeInputRef : undefined}
            placeholder="例如 600519 / 510880 / AU9999；可自动反查类型"
            onBlur={onCodeBlur}
          />
        </Form.Item>
        <Form.Item label="资产名称" name="name">
          <Input
            placeholder="例如 贵州茅台 / 红利ETF；可自动反查代码"
            onBlur={onNameBlur}
          />
        </Form.Item>
        <Form.Item label="识别结果">
          <Input
            value={
              [form.getFieldValue('assetType'), form.getFieldValue('market'), form.getFieldValue('code')]
                .filter((item) => typeof item === 'string' && item.trim().length > 0)
                .join(' / ') || (searchingIdentity ? '识别中...' : '未识别')
            }
            disabled
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
