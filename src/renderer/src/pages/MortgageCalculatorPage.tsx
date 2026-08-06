import { Button, Col, Form, InputNumber, Radio, Row, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { AppCard } from '@renderer/components/app/AppCard'
import { housingApi } from '@renderer/services/housingApi'
import type { MortgageRepaymentItemDto, MortgageRequestDto, MortgageResultDto } from '@shared/contracts/api'

const columns: ColumnsType<MortgageRepaymentItemDto> = [
  { title: '期数', dataIndex: 'month', width: 70, align: 'right' },
  { title: '月供 (元)', dataIndex: 'payment', align: 'right', render: (v: number) => v.toFixed(2) },
  { title: '本金 (元)', dataIndex: 'principal', align: 'right', render: (v: number) => v.toFixed(2) },
  { title: '利息 (元)', dataIndex: 'interest', align: 'right', render: (v: number) => v.toFixed(2) },
  { title: '剩余本金 (元)', dataIndex: 'remainingBalance', align: 'right', render: (v: number) => v.toFixed(2) }
]

export function MortgageCalculatorPage() {
  const [apiMessage, messageHolder] = message.useMessage()
  const [result, setResult] = useState<MortgageResultDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  async function handleCalculate() {
    const values = await form.validateFields()
    setLoading(true)
    try {
      const request: MortgageRequestDto = {
        totalPrice: values.totalPrice,
        downPaymentPercent: values.downPaymentPercent,
        loanYears: values.loanYears,
        annualInterestRate: values.annualInterestRate,
        repaymentMethod: values.repaymentMethod
      }
      const next = await housingApi.calculateMortgage(request)
      setResult(next)
    } catch (calcError) {
      apiMessage.error(calcError instanceof Error ? calcError.message : '计算失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ledger-page">
      {messageHolder}

      <section className="ledger-watchlist-header">
        <div className="ledger-watchlist-copy">
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
            房贷计算器
          </h1>
          <p className="ledger-hero-subtitle">等额本息 / 等额本金，月供、利息总额与还款计划一览。</p>
        </div>
      </section>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={8}>
          <AppCard title="贷款参数">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                totalPrice: 300,
                downPaymentPercent: 30,
                loanYears: 30,
                annualInterestRate: 3.1,
                repaymentMethod: 'EQUAL_INSTALLMENT'
              }}
            >
              <Form.Item
                label="房屋总价（万元）"
                name="totalPrice"
                rules={[{ required: true, message: '请输入房屋总价' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} max={100000} />
              </Form.Item>
              <Form.Item
                label="首付比例（%）"
                name="downPaymentPercent"
                rules={[{ required: true, message: '请输入首付比例' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} max={99} />
              </Form.Item>
              <Form.Item
                label="贷款年限（年）"
                name="loanYears"
                rules={[{ required: true, message: '请输入贷款年限' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} max={50} />
              </Form.Item>
              <Form.Item
                label="贷款利率（年利率 %）"
                name="annualInterestRate"
                rules={[{ required: true, message: '请输入利率' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} max={20} step={0.05} />
              </Form.Item>
              <Form.Item label="还款方式" name="repaymentMethod">
                <Radio.Group>
                  <Radio.Button value="EQUAL_INSTALLMENT">等额本息</Radio.Button>
                  <Radio.Button value="EQUAL_PRINCIPAL">等额本金</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Button type="primary" block loading={loading} onClick={() => void handleCalculate()}>
                计算
              </Button>
            </Form>
          </AppCard>
        </Col>

        <Col xs={24} lg={16}>
          <AppCard title="计算结果">
            {result == null ? (
              <div style={{ color: 'var(--text-faint)', padding: 40, textAlign: 'center' }}>
                填写左侧参数后点击「计算」。
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div className="ledger-metric-panel is-primary">
                    <div className="ledger-metric-label">贷款金额</div>
                    <div className="ledger-metric-value">{result.loanAmount.toFixed(0)} 万</div>
                  </div>
                  {result.monthlyPayment != null ? (
                    <div className="ledger-metric-panel">
                      <div className="ledger-metric-label">月供（等额本息）</div>
                      <div className="ledger-metric-value">{result.monthlyPayment.toFixed(2)} 元</div>
                    </div>
                  ) : null}
                  {result.firstMonthPayment != null ? (
                    <div className="ledger-metric-panel">
                      <div className="ledger-metric-label">首月月供（等额本金）</div>
                      <div className="ledger-metric-value">{result.firstMonthPayment.toFixed(2)} 元</div>
                    </div>
                  ) : null}
                  <div className="ledger-metric-panel">
                    <div className="ledger-metric-label">利息总额</div>
                    <div className="ledger-metric-value">{result.totalInterest.toFixed(2)} 万</div>
                  </div>
                  <div className="ledger-metric-panel">
                    <div className="ledger-metric-label">还款总额</div>
                    <div className="ledger-metric-value">{result.totalPayment.toFixed(2)} 万</div>
                  </div>
                  <div className="ledger-metric-panel">
                    <div className="ledger-metric-label">利息占比</div>
                    <div className="ledger-metric-value">{(result.interestRatio * 100).toFixed(1)}%</div>
                  </div>
                </div>
                {result.schedule.length > 0 ? (
                  <Table<MortgageRepaymentItemDto>
                    rowKey="month"
                    size="small"
                    columns={columns}
                    dataSource={result.schedule}
                    pagination={{ pageSize: 12, showSizeChanger: false }}
                    scroll={{ y: 360 }}
                    className="soft-table"
                  />
                ) : null}
              </>
            )}
          </AppCard>
        </Col>
      </Row>
    </div>
  )
}
