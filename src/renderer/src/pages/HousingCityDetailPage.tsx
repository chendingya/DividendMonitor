import { Button, Col, Form, Input, InputNumber, Row, message } from 'antd'
import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import * as echarts from 'echarts'
import { AppCard } from '@renderer/components/app/AppCard'
import { ChartExportButton } from '@renderer/components/app/ChartExportButton'
import { PageState } from '@renderer/components/app/PageState'
import { useHousingCityDetail, useHousingUserData } from '@renderer/hooks/useHousing'
import type { HousingIndexPointDto, HousingPriceTrendPointDto } from '@shared/contracts/api'

function formatPercent(value: number | undefined, digits = 2): string {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
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

function IndexHistoryChart({ history }: { history: HousingIndexPointDto[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  const data = useMemo(() => {
    const limited = history.slice(-36).reverse()
    return {
      labels: limited.map((item) => item.reportDate),
      newHomeYoY: limited.map((item) => item.newHomeYoY),
      secondHandYoY: limited.map((item) => item.secondHandYoY)
    }
  }, [history])

  useEffect(() => {
    if (!chartRef.current) return
    const chart = echarts.init(chartRef.current)
    instanceRef.current = chart

    chart.setOption({
      animation: false,
      grid: { left: 56, right: 24, top: 32, bottom: 28 },
      tooltip: { trigger: 'axis' },
      legend: { top: 4, right: 8, itemWidth: 12, itemHeight: 12, textStyle: { color: '#66707a' } },
      xAxis: {
        type: 'category',
        data: data.labels,
        axisLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.28)' } },
        axisLabel: { color: '#66707a' }
      },
      yAxis: {
        type: 'value',
        name: '同比 (上年同月=100)',
        nameTextStyle: { color: '#66707a' },
        axisLabel: { color: '#66707a' },
        splitLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.12)' } }
      },
      series: [
        {
          name: '新建住宅同比',
          type: 'line',
          data: data.newHomeYoY,
          smooth: true,
          symbolSize: 6,
          lineStyle: { color: '#0052d0', width: 2.5 },
          itemStyle: { color: '#0052d0' }
        },
        {
          name: '二手住宅同比',
          type: 'line',
          data: data.secondHandYoY,
          smooth: true,
          symbolSize: 6,
          lineStyle: { color: '#f0883e', width: 2.5 },
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
  }, [data])

  return (
    <AppCard title="70 城房价指数（统计局口径）">
      <div style={{ marginBottom: 8, color: '#8b949e', fontSize: 12 }}>
        定基指数已停发，此处展示同比（上年同月=100）；环比可反映短期动能。
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <ChartExportButton instanceRef={instanceRef} filename="housing-index-history" />
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 300 }} />
    </AppCard>
  )
}

export function HousingCityDetailPage() {
  const { city: rawCity } = useParams<{ city: string }>()
  const city = rawCity ? decodeURIComponent(rawCity) : ''
  const [apiMessage, messageHolder] = message.useMessage()
  const [form] = Form.useForm()
  const { data, loading, error, reload } = useHousingCityDetail(city)
  const { save, saving } = useHousingUserData(() => {
    apiMessage.success('自定义数据已保存')
    void reload()
  })

  useEffect(() => {
    if (!data?.userData) return
    form.setFieldsValue({
      pricePerSqm: data.userData.pricePerSqm,
      rentPerSqm: data.userData.rentPerSqm,
      district: data.userData.district,
      community: data.userData.community,
      note: data.userData.note
    })
  }, [data?.userData, form])

  async function handleSave() {
    const values = await form.validateFields()
    await save({ city, ...values })
  }

  return (
    <PageState loading={loading} error={error}>
      <div className="ledger-page">
        {messageHolder}

        <section className="ledger-watchlist-header">
          <div className="ledger-watchlist-copy">
            <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
              {city}
            </h1>
            <p className="ledger-hero-subtitle">
              数据期 {data?.period ?? '--'} · {data?.unit ?? ''}
            </p>
            <div className="ledger-watchlist-summary">
              <span className="pill primary">均价 {data?.pricePerSqm?.toLocaleString() ?? '--'} 元/㎡</span>
              <span className="pill">租金 {data?.rentPerSqm?.toFixed(1) ?? '--'} 元/㎡·月</span>
              <span className="pill">租金收益率 {data?.rentalYieldPercent?.toFixed(2) ?? '--'}%</span>
              <span className="pill">租售比 {data?.priceToRentRatio?.toFixed(1) ?? '--'} 年</span>
            </div>
          </div>
        </section>

        <Row gutter={[20, 20]}>
          <Col xs={24} lg={14}>
            <PriceTrendChart trend={data?.priceTrend ?? []} />
          </Col>
          <Col xs={24} lg={10}>
            <AppCard title="自定义数据">
              <div style={{ marginBottom: 8, color: '#8b949e', fontSize: 12 }}>
                录入区/小区级房价与租金后，收益率按你的数据重算（覆盖自动数据）。
              </div>
              <Form form={form} layout="vertical" size="small">
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item label="房价 (元/㎡)" name="pricePerSqm">
                      <InputNumber style={{ width: '100%' }} min={0} placeholder="如 58000" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="月租金 (元/㎡)" name="rentPerSqm">
                      <InputNumber style={{ width: '100%' }} min={0} placeholder="如 90" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item label="区域" name="district">
                      <Input placeholder="如 朝阳区" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="小区" name="community">
                      <Input placeholder="如 望京某小区" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="备注" name="note">
                  <Input.TextArea rows={2} placeholder="可选" />
                </Form.Item>
                <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                  保存
                </Button>
                {data?.userData ? (
                  <span style={{ marginLeft: 12, color: '#8b949e', fontSize: 12 }}>
                    上次更新 {new Date(data.userData.updatedAt).toLocaleString()}
                  </span>
                ) : null}
              </Form>
            </AppCard>
          </Col>
          <Col xs={24} lg={14}>
            <IndexHistoryChart history={data?.indexHistory ?? []} />
          </Col>
          <Col xs={24} lg={10}>
            <AppCard title="环比涨跌">
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
                  <div className="ledger-metric-label">租金收益率（自动口径）</div>
                  <div className="ledger-metric-value">{data?.rentalYieldPercent == null ? '--' : `${data.rentalYieldPercent.toFixed(2)}%`}</div>
                  <div className="ledger-metric-hint">月租金 × 12 ÷ 房价</div>
                </div>
              </div>
            </AppCard>
          </Col>
        </Row>
      </div>
    </PageState>
  )
}
