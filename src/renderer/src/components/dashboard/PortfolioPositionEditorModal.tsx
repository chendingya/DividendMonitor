import { Form, Input, InputNumber, message, Modal, Select } from 'antd'
import type { InputRef } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetSearchItemDto, AssetType, MarketCode } from '@shared/contracts/api'
import { buildAssetKey, parseAssetKey } from '@shared/contracts/api'
import { useSettings } from '@renderer/hooks/useSettings'
import { pickBestSearchResult } from './portfolioAssetIdentity'
import { AppDatePicker } from '@renderer/components/app/AppDatePicker'
import { normalizeCalendarDate } from '@renderer/utils/calendarDate'
import { calculatePortfolioEditorCost } from './portfolioTransactionEditor'
import './portfolioEditorMobile.css'

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
  originalAvgCost?: number
  tradePrice?: number
  openedAt?: string
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
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
  tradePrice?: number
  openedAt?: string
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
}

type Props = {
  open: boolean
  mode: PortfolioEditorMode
  initialValues: PortfolioEditorInitialValues
  onCancel: () => void
  onSubmit: (values: PortfolioEditorSubmitValues) => Promise<void> | void
  assetApi: AssetApi
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
  const [submitting, setSubmitting] = useState(false)
  const [identityError, setIdentityError] = useState<string>()
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
    openedAt?: string
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  }>()
  const codeInputRef = useRef<InputRef | null>(null)
  const lookupVersion = useRef(0)
  const explicitType = useRef<AssetType>()
  const explicitMarket = useRef<MarketCode>()
  const lastResolvedIdentity = useRef<AssetSearchItemDto>()
  const { settings } = useSettings()
  const commissionRate = settings?.buyCommissionRate ?? 0.0001
  const minCommission = settings?.buyMinCommission ?? 5

  const watchedShares = Form.useWatch('shares', form)
  const watchedPrice = Form.useWatch('avgCost', form)
  const watchedType = Form.useWatch('assetType', form)
  const watchedMarket = Form.useWatch('market', form)
  const watchedCode = Form.useWatch('code', form)
  const watchedDirection = Form.useWatch('direction', form) ?? 'BUY'
  const isMetal = watchedType === 'GOLD' || watchedType === 'SILVER'
  const quantityLabel = isMetal ? '持仓数量' : watchedType === 'FUND' ? '持有份额' : '持仓股数'
  const commissionInfo = useMemo(() => {
    const shares = watchedShares ?? 0
    const price = watchedPrice ?? 0
    if (shares <= 0 || price <= 0) return null
    return calculatePortfolioEditorCost({ mode, direction: watchedDirection, initialValues, shares, price, commissionRate, minCommission })
  }, [watchedShares, watchedPrice, watchedDirection, commissionRate, minCommission, mode, initialValues])

  useEffect(() => {
    lookupVersion.current += 1
    setSearchingIdentity(false)
    setIdentityError(undefined)
    if (!open) {
      return
    }
    explicitType.current = initialValues.assetType
    explicitMarket.current = initialValues.market
    lastResolvedIdentity.current = undefined
    form.setFieldsValue({
      assetKey: initialValues.assetKey ?? '',
      assetType: initialValues.assetType,
      market: initialValues.market,
      code: initialValues.code ?? '',
      symbol: initialValues.symbol ?? '',
      name: initialValues.name ?? '',
      direction: initialValues.direction ?? 'BUY',
      shares: initialValues.shares,
      avgCost: initialValues.avgCost,
      openedAt: normalizeCalendarDate(initialValues.openedAt),
      riskLevel: initialValues.riskLevel
    })
    const timer = setTimeout(() => {
      if (mode === 'create') {
        codeInputRef.current?.focus()
      }
    }, 0)
    return () => {
      clearTimeout(timer)
      lookupVersion.current += 1
    }
  }, [form, initialValues, open, mode])

  function fillIdentity(item: AssetSearchItemDto) {
    lastResolvedIdentity.current = item
    setIdentityError(undefined)
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
    const version = ++lookupVersion.current
    try {
      const results = await assetApi.search({
        keyword: normalized,
        assetTypes: explicitType.current ? [explicitType.current] : ['STOCK', 'ETF', 'FUND', 'GOLD', 'SILVER']
      })
      if (version !== lookupVersion.current) throw new DOMException('资产输入已变更，请重新识别后保存', 'AbortError')
      const best = pickBestSearchResult(normalized, results, explicitType.current, explicitMarket.current)
      if (best) {
        fillIdentity(best)
      } else {
        setIdentityError(results.length > 0
          ? '无法唯一识别，请选择资产类型、市场或填写完整资产名称'
          : '未找到匹配资产，请检查代码或名称；也可手动填写类型、市场、代码和名称')
      }
      return best ?? null
    } finally {
      if (version === lookupVersion.current) setSearchingIdentity(false)
    }
  }

  function invalidateIdentity(clearName: boolean) {
    lookupVersion.current += 1
    setSearchingIdentity(false)
    setIdentityError(undefined)
    const previous = lastResolvedIdentity.current
    form.setFieldsValue({
      assetKey: '', symbol: '', assetType: explicitType.current, market: explicitMarket.current,
      ...(clearName && previous && form.getFieldValue('name') === previous.name ? { name: '' } : {})
    })
    lastResolvedIdentity.current = undefined
  }

  async function onCodeBlur() {
    const code = form.getFieldValue('code')?.trim()
    if (!code || form.getFieldValue('assetKey')) {
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
    if (!name || code) {
      return
    }
    try {
      await searchAndFill(name)
    } catch {
      // ignore blur-time lookup failures
    }
  }

  async function handleOk() {
    if (submitting) return
    setSubmitting(true)
    try {
      const values = await form.validateFields()
      let resolvedCode = values.code?.trim().toUpperCase() ?? ''
      let resolvedName = values.name?.trim() ?? ''
      let resolvedAssetType = values.assetType
      let resolvedMarket = values.market
      if (!resolvedCode && !resolvedName) {
        apiMessage.error('资产代码和名称至少填写一个')
        return
      }
      const previous = values.assetKey ? parseAssetKey(values.assetKey) : null
      const alreadyResolved = previous && previous.assetType === resolvedAssetType
        && previous.market === resolvedMarket && previous.code === resolvedCode
      if (!alreadyResolved) {
        let best: AssetSearchItemDto | null = null
        try {
          best = await searchAndFill(resolvedCode || resolvedName)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return
          setIdentityError('资产识别失败，请检查网络；也可手动填写类型、市场、代码和名称')
        }
        if (best) {
          resolvedAssetType = best.assetType
          resolvedMarket = best.market
          resolvedCode = best.code
          resolvedName = best.name
        } else if (!resolvedCode || !resolvedName || !explicitType.current || !explicitMarket.current) {
          apiMessage.error('请先完成资产识别，或手动填写资产类型、市场、代码和名称')
          return
        }
      }
      if (!resolvedAssetType || !resolvedMarket || !resolvedCode) {
        apiMessage.error('请填写完整资产类型、市场和代码')
        return
      }
      const metal = resolvedAssetType === 'GOLD' || resolvedAssetType === 'SILVER'
      if ((metal && resolvedMarket !== 'SGE') || (!metal && resolvedMarket !== 'A_SHARE')) {
        apiMessage.error('资产类型与市场不匹配，请重新选择')
        return
      }
      if (!metal && !/^\d{6}$/.test(resolvedCode)) {
        apiMessage.error('A股、ETF与基金代码必须为6位数字')
        return
      }

      // 佣金：max(成交额×费率, 最低佣金)，费率与最低佣金从设置读取
      const cost = calculatePortfolioEditorCost({
        mode, direction: values.direction, initialValues, shares: values.shares, price: values.avgCost, commissionRate, minCommission
      })
      if (cost.trueCost <= 0) {
        apiMessage.error('卖出成交额需高于佣金，请调整数量、价格或手续费设置')
        return
      }

      await onSubmit({
        assetKey: buildAssetKey(resolvedAssetType, resolvedMarket, resolvedCode),
        assetType: resolvedAssetType,
        market: resolvedMarket,
        code: resolvedCode || undefined,
        symbol: resolvedAssetType === 'STOCK' ? resolvedCode : undefined,
        name: resolvedName,
        direction: values.direction,
        shares: values.shares,
        avgCost: cost.trueCost,
        tradePrice: cost.tradePrice,
        openedAt: normalizeCalendarDate(values.openedAt),
        riskLevel: values.riskLevel
      })
    } catch (error) {
      if (error instanceof Error) {
        apiMessage.error(error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal className="portfolio-editor-modal" open={open} title={mode === 'edit' ? '编辑持仓' : '添加资产'} onCancel={onCancel} onOk={handleOk} confirmLoading={submitting} cancelText="取消" okText={mode === 'edit' ? '保存修改' : '添加'}>
      {messageHolder}
      <Form form={form} layout="vertical">
        <Form.Item name="assetKey" hidden>
          <Input />
        </Form.Item>
        <Form.Item label="资产类型" name="assetType">
          <Select
            allowClear
            placeholder="自动识别，或手动选择"
            onChange={(value: AssetType | undefined) => {
              explicitType.current = value
              explicitMarket.current = value ? (value === 'GOLD' || value === 'SILVER' ? 'SGE' : 'A_SHARE') : undefined
              invalidateIdentity(false)
            }}
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
            allowClear
            placeholder="自动识别，或手动选择"
            onChange={(value: MarketCode | undefined) => {
              explicitMarket.current = value
              invalidateIdentity(false)
            }}
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
        <Form.Item label="风险等级" name="riskLevel" extra="可选。用于工作台「按风险归类」饼图聚合">
          <Select
            allowClear
            placeholder="未指定"
            options={[
              { label: '低风险', value: 'LOW' },
              { label: '中风险', value: 'MEDIUM' },
              { label: '高风险', value: 'HIGH' }
            ]}
          />
        </Form.Item>
        <Form.Item
          label="资产代码"
          name="code"
        >
          <Input
            ref={mode === 'create' ? codeInputRef : undefined}
            placeholder="例如 600519 / 510880 / AU9999；可自动反查类型"
            onBlur={onCodeBlur}
            onChange={() => invalidateIdentity(true)}
          />
        </Form.Item>
        <Form.Item label="资产名称" name="name">
          <Input
            placeholder="例如 贵州茅台 / 红利ETF；可自动反查代码"
            onBlur={onNameBlur}
            onChange={() => {
              lookupVersion.current += 1
              setSearchingIdentity(false)
              setIdentityError(undefined)
            }}
          />
        </Form.Item>
        <Form.Item label="识别结果" validateStatus={identityError ? 'warning' : undefined} help={identityError}>
          <Input
            value={
              searchingIdentity ? '识别中...' : [watchedType, watchedMarket, watchedCode]
                .filter((item) => typeof item === 'string' && item.trim().length > 0)
                .join(' / ') || '未识别'
            }
            disabled
          />
        </Form.Item>
        <Form.Item label={quantityLabel} name="shares" rules={[{ required: true, message: `请输入${quantityLabel}` }, { type: 'number', min: 0.0001, message: '数量必须大于0' }]}>
          <InputNumber min={isMetal || watchedType === 'FUND' ? 0.0001 : 0.01} precision={isMetal || watchedType === 'FUND' ? 4 : 2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label={mode === 'edit' && initialValues.tradePrice == null ? `原${watchedDirection === 'SELL' ? '净回款单价' : '成本价'}（修改视为新成交价）` : '成交价'}
          name="avgCost"
          rules={[{ required: true, message: '请输入成交价' }, { type: 'number', min: 0.0001, message: '成交价必须大于0' }]}
          extra={mode === 'edit' && initialValues.tradePrice == null
            ? `原记录未保存成交价，价格未改时保留原${watchedDirection === 'SELL' ? '净回款单价' : '成本'}；修改价格后按新成交价计算佣金。`
            : watchedDirection === 'SELL'
              ? '卖出净回款 = 成交额 − 佣金，每单位净回款用于扣减持仓净成本。'
              : '买入总支出 = 成交额 + 佣金，每单位实际成本 = 总支出 ÷ 数量。'}
        >
          <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder={isMetal ? '每单位成交单价' : watchedType === 'FUND' ? '每份成交净值' : '每股成交单价'} />
        </Form.Item>
        {commissionInfo && (
          <div style={{ margin: '-16px 0 16px', padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 13, color: '#66707a' }}>
            {commissionInfo.preserved
              ? watchedDirection === 'SELL' ? '保留原净回款单价（已扣历史费用）' : '保留原交易成本（含历史费用）'
              : `成交额 ¥${commissionInfo.tradeAmount.toFixed(2)} · 佣金 ¥${commissionInfo.commission.toFixed(2)} · ${watchedDirection === 'SELL' ? '卖出净回款' : '买入总支出'} ¥${(commissionInfo.trueCost * (watchedShares ?? 0)).toFixed(2)} · ${watchedDirection === 'SELL' ? '每单位净回款' : '实际成本价'}`} <span style={{ color: '#0052d0', fontWeight: 600 }}>¥{commissionInfo.trueCost.toFixed(3)}</span>
          </div>
        )}
        <Form.Item label={watchedDirection === 'SELL' ? '卖出日期' : '买入日期'} name="openedAt" extra={watchedDirection === 'SELL' ? '可选。记录这笔卖出的交易日期。' : '可选。填写后自动除权除息只扣除该日期之后的分红。'}>
          <AppDatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
