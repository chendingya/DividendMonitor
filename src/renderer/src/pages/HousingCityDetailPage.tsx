import { Alert, Button, Col, Empty, Form, Input, InputNumber, Popconfirm, Row, Tag, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as echarts from 'echarts'
import { AppCard } from '@renderer/components/app/AppCard'
import { ChartExportButton } from '@renderer/components/app/ChartExportButton'
import { PageState } from '@renderer/components/app/PageState'
import { useHousingCityDetail, useHousingUserData } from '@renderer/hooks/useHousing'
import { computeIndexChangePercent, formatTotalYuan } from '@renderer/utils/housingCalc'
import type { HousingIndexSeriesPointDto, HousingPriceTrendPointDto } from '@shared/contracts/api'
import '@renderer/components/housing/housingMobile.css'

function formatPercent(value: number | undefined, digits = 2): string {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
}

/** 指数序列覆盖范围内可选的基准年（默认锚定 2021 房价高点） */
function buildBaseYearOptions(series: HousingIndexSeriesPointDto[]): string[] {
  const years = new Set(series.map((point) => point.reportDate.slice(0, 4)))
  const candidates = ['2021', '2018', '2015', '起点']
  const available: string[] = []
  for (const candidate of candidates) {
    if (candidate === '起点' || years.has(candidate)) {
      available.push(candidate)
    }
  }
  return available
}

function PriceTrendChart({ trend }: { trend: HousingPriceTrendPointDto[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return
    const chart = echarts.init(chartRef.current)
    instanceRef.current = chart

    chart.setOption({
      animation: false,
      grid: { left: 56, right: 24, top: 32, bottom: 28 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: trend.map((item) => item.period),
        axisLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.28)' } },
        axisLabel: { color: '#66707a' }
      },
      yAxis: {
        type: 'value',
        name: '元/㎡',
        nameTextStyle: { color: '#66707a' },
        axisLabel: { color: '#66707a' },
        splitLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.12)' } }
      },
      series: [
        {
          name: '样本均价',
          type: 'line',
          data: trend.map((item) => item.pricePerSqm),
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color: '#0052d0', width: 2.5 },
          itemStyle: { color: '#0052d0' }
        }
      ]
    })

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      instanceRef.current = null
    }
  }, [trend])

  return (
    <AppCard title="样本均价趋势">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <ChartExportButton instanceRef={instanceRef} filename="housing-price-trend" />
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 300 }} />
    </AppCard>
  )
}

function IndexSeriesChart({ series }: { series: HousingIndexSeriesPointDto[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const touchedRef = useRef(false)
  const [baseYear, setBaseYear] = useState('起点')

  const baseYearOptions = useMemo(() => buildBaseYearOptions(series), [series])
  const effectiveBaseYear = useMemo(() => {
    if (!touchedRef.current && baseYearOptions.includes('2021')) return '2021'
    return baseYear
  }, [baseYear, baseYearOptions])
  const changeResult = useMemo(() => computeIndexChangePercent(series, effectiveBaseYear), [series, effectiveBaseYear])

  /** 图表只展示基准锚点起的数据（选 2021 则横坐标从 2021-01 开始，避免 2011 全量挤压） */
  const visiblePoints = useMemo(() => {
    if (changeResult.points.length === 0 || changeResult.baseDate == null) return changeResult.points
    const baseIndex = changeResult.points.findIndex((point) => point.reportDate === changeResult.baseDate)
    return baseIndex > 0 ? changeResult.points.slice(baseIndex) : changeResult.points
  }, [changeResult])

  useEffect(() => {
    if (!chartRef.current || visiblePoints.length === 0) return
    const chart = echarts.init(chartRef.current)
    instanceRef.current = chart

    chart.setOption({
      animation: false,
      grid: { left: 56, right: 24, top: 40, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => `${Number(value).toFixed(1)}%`
      },
      legend: { top: 4, right: 8, itemWidth: 12, itemHeight: 12, textStyle: { color: '#66707a' } },
      xAxis: {
        type: 'category',
        data: visiblePoints.map((item) => item.reportDate),
        axisLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.28)' } },
        axisLabel: { color: '#66707a' }
      },
      yAxis: {
        type: 'value',
        name: '累计涨跌幅 (%)',
        nameTextStyle: { color: '#66707a' },
        axisLabel: { color: '#66707a', formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.12)' } }
      },
      series: [
        {
          name: '新建住宅指数',
          type: 'line',
          data: visiblePoints.map((item) => item.newHomeChangePercent),
          smooth: true,
          symbolSize: 4,
          lineStyle: { color: '#0052d0', width: 2 },
          itemStyle: { color: '#0052d0' }
        },
        {
          name: '二手住宅指数',
          type: 'line',
          data: visiblePoints.map((item) => item.secondHandChangePercent),
          smooth: true,
          symbolSize: 4,
          lineStyle: { color: '#f0883e', width: 2 },
          itemStyle: { color: '#f0883e' }
        }
      ]
    })

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      instanceRef.current = null
    }
  }, [visiblePoints, changeResult.baseDate])

  if (series.length === 0) {
    return (
      <AppCard title="70 城房价指数走势（统计局口径）">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="该城市不在统计局 70 城房价指数样本内，暂无指数数据。可查看上方中指研究院样本均价趋势。"
        />
      </AppCard>
    )
  }

  return (
    <AppCard title="70 城房价指数走势（统计局口径）">
      <div style={{ marginBottom: 8, color: 'var(--text-faint)', fontSize: 12 }}>
        定基指数已停发，此处由月度环比连乘重建。以所选基准月为 0%，展示相对累计涨跌幅。
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className="ledger-segmented-control">
          {baseYearOptions.map((option) => (
            <button
              type="button"
              key={option}
              className={`ledger-filter-chip ${effectiveBaseYear === option ? 'is-active' : ''}`}
              onClick={() => {
                touchedRef.current = true
                setBaseYear(option)
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-main)' }}>
          较 {changeResult.baseDate ?? '--'}：
          <span style={{ color: '#0052d0', marginLeft: 4 }}>
            新建 {formatPercent(changeResult.newHomeChange ?? undefined, 1)}
          </span>
          <span style={{ color: '#f0883e', marginLeft: 8 }}>
            二手 {formatPercent(changeResult.secondHandChange ?? undefined, 1)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <ChartExportButton instanceRef={instanceRef} filename="housing-index-series" />
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 300 }} />
    </AppCard>
  )
}

export function HousingCityDetailPage() {
  const navigate = useNavigate()
  const { city: rawCity } = useParams<{ city: string }>()
  const city = rawCity ? decodeURIComponent(rawCity) : ''
  const [apiMessage, messageHolder] = message.useMessage()
  const [form] = Form.useForm()
  const { data, loading, error, reload, setData } = useHousingCityDetail(city)
  const { save, remove, saving, removing } = useHousingUserData(reload)

  useEffect(() => {
    if (!data || data.city !== city) {
      form.resetFields()
      return
    }
    form.setFieldsValue({
      priceTotalYuan: data.userData?.priceTotalYuan,
      rentTotalMonthYuan: data.userData?.rentTotalMonthYuan,
      district: data.userData?.district,
      community: data.userData?.community,
      note: data.userData?.note
    })
  }, [city, data, form])

  async function handleSave() {
    try {
      const values = await form.validateFields()
      const result = await save({ city, ...values })
      if (result.refreshError) {
        apiMessage.warning(`自定义数据已保存，但刷新失败：${result.refreshError}`)
      } else {
        apiMessage.success('自定义数据已保存')
      }
    } catch (saveError) {
      if (saveError && typeof saveError === 'object' && 'errorFields' in saveError) return
      apiMessage.error(saveError instanceof Error ? saveError.message : '保存失败')
    }
  }

  async function handleRemove() {
    try {
      const result = await remove(city)
      form.resetFields()
      if (result.refreshError) {
        setData((previous) => previous ? {
          ...previous, userData: undefined, yieldSource: 'market', rentalYieldPercent: undefined, priceToRentRatio: undefined
        } : previous)
        apiMessage.warning(`已清除自定义数据，但刷新失败：${result.refreshError}`)
      } else {
        apiMessage.success('已清除自定义数据')
      }
    } catch (removeError) {
      apiMessage.error(removeError instanceof Error ? removeError.message : '清除失败')
    }
  }

  const hasCustomData = data?.userData?.priceTotalYuan != null || data?.userData?.rentTotalMonthYuan != null
  const hasIndexData = (data?.indexSeries?.length ?? 0) > 0

  return (
    <PageState loading={loading && !data}>
      <div className="ledger-page">
        {messageHolder}
        {error ? <Alert type="error" showIcon message="房价数据加载失败" description={error} action={<Button onClick={() => void reload().catch(() => {})}>重试</Button>} /> : null}

        <section className="ledger-watchlist-header">
          <div className="ledger-watchlist-copy">
            <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
              {city}
            </h1>
            <p className="ledger-hero-subtitle">
              数据期 {data?.period ?? '--'} · {data?.unit ?? ''}
            </p>
            <div className="ledger-watchlist-summary" data-testid="housing-custom-summary">
              {hasCustomData ? (
                <>
                  <span className="pill primary">
                    房价 {formatTotalYuan(data?.userData?.priceTotalYuan)} 元
                    <Tag color="blue" style={{ marginLeft: 6 }}>自定义</Tag>
                  </span>
                  <span className="pill">月租 {formatTotalYuan(data?.userData?.rentTotalMonthYuan)} 元/月</span>
                </>
              ) : (
                <>
                  <span className="pill primary">均价 {data?.pricePerSqm?.toLocaleString() ?? '--'} 元/㎡</span>
                  <span className="pill">租金 {data?.rentPerSqm?.toFixed(1) ?? '--'} 元/㎡·月</span>
                </>
              )}
              <span className="pill">租金收益率 {data?.rentalYieldPercent?.toFixed(2) ?? '--'}%</span>
              <span className="pill">租售比 {data?.priceToRentRatio?.toFixed(1) ?? '--'} 年</span>
              {hasCustomData && data?.rentalYieldPercent == null ? <span className="pill">待补充总价和月租金</span> : null}
            </div>
          </div>
          <div className="ledger-hero-actions">
            <button type="button" className="ledger-secondary-button" onClick={() => navigate('/housing')}>
              返回城市列表
            </button>
          </div>
        </section>

        <Row gutter={[20, 20]}>
          <Col xs={{ span: 24, order: 1 }} lg={{ span: 14, order: 0 }}>
            <PriceTrendChart trend={data?.priceTrend ?? []} />
          </Col>
          <Col xs={{ span: 24, order: 0 }} lg={{ span: 10, order: 1 }}>
            <AppCard title="自定义数据">
              <div style={{ marginBottom: 8, color: 'var(--text-faint)', fontSize: 12 }}>
                每个城市可保存一组区/小区参数。总价和整套月租金填完整后，详情、首页与收益对比按你的数据重算。
              </div>
              <Form form={form} layout="vertical" size="small" data-testid="housing-custom-form">
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="房价总价 (元)" name="priceTotalYuan">
                      <InputNumber style={{ width: '100%' }} min={0} placeholder="如 5000000" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="月租金 (元/月)" name="rentTotalMonthYuan">
                      <InputNumber style={{ width: '100%' }} min={0} placeholder="如 8000" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="区域" name="district">
                      <Input placeholder="如 朝阳区" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="小区" name="community">
                      <Input placeholder="如 望京某小区" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="备注" name="note">
                  <Input.TextArea rows={2} placeholder="可选" />
                </Form.Item>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <Button type="primary" loading={saving} disabled={removing} onClick={() => void handleSave()} style={{ minHeight: 44 }}>
                    保存
                  </Button>
                  {data?.userData ? (
                    <>
                      <Popconfirm
                        title="清除自定义数据"
                        description="将删除该城市录入的总价与月租金，恢复自动数据口径。"
                        okText="清除"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void handleRemove()}
                      >
                        <Button danger loading={removing} disabled={saving} style={{ minHeight: 44 }}>
                          清除
                        </Button>
                      </Popconfirm>
                      <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                        上次更新 {new Date(data.userData.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                      </span>
                    </>
                  ) : null}
                </div>
              </Form>
            </AppCard>
          </Col>
          <Col xs={{ span: 24, order: 2 }} lg={{ span: 14, order: 2 }}>
            <IndexSeriesChart series={data?.indexSeries ?? []} />
          </Col>
          <Col xs={{ span: 24, order: 3 }} lg={{ span: 10, order: 3 }}>
            <AppCard title="环比涨跌">
              {!hasIndexData ? (
                <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                  该城市暂无统计局指数数据（非 70 城样本）。
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div className="ledger-metric-panel">
                    <div className="ledger-metric-label">新建住宅环比</div>
                    <div className="ledger-metric-value">{formatPercent(data?.momPercent)}</div>
                  </div>
                  <div className="ledger-metric-panel">
                    <div className="ledger-metric-label">新建住宅同比</div>
                    <div className="ledger-metric-value">{formatPercent(data?.yoyPercent)}</div>
                  </div>
                  <div className="ledger-metric-panel">
                    <div className="ledger-metric-label">租金收益率{hasCustomData ? '（自定义口径）' : '（自动口径）'}</div>
                    <div className="ledger-metric-value">{data?.rentalYieldPercent == null ? '--' : `${data.rentalYieldPercent.toFixed(2)}%`}</div>
                    <div className="ledger-metric-hint">
                      {hasCustomData ? '月租金 × 12 ÷ 房价总价' : '月租金 × 12 ÷ 房价'}
                    </div>
                  </div>
                </div>
              )}
            </AppCard>
          </Col>
        </Row>
      </div>
    </PageState>
  )
}
