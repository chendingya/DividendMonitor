import { Skeleton, Alert, Table, Tag, Card, Row, Col } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useIndustryAnalysis } from '@renderer/hooks/useIndustryAnalysis'
import type { IndustryStockEntryDto } from '@shared/contracts/api'
import { IndustryDistributionPie } from '@renderer/components/industry/IndustryDistributionPie'

const percentFormatter = new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 1 })

const stockColumns: ColumnsType<IndustryStockEntryDto> = [
  { title: '代码', dataIndex: 'symbol', key: 'symbol', width: 100 },
  { title: '名称', dataIndex: 'name', key: 'name', width: 120 },
  {
    title: '股息率', dataIndex: 'dividendYield', key: 'dividendYield', width: 100,
    render: (v: number) => percentFormatter.format(v)
  },
  { title: 'PE', dataIndex: 'peRatio', key: 'peRatio', width: 80, render: (v: number) => v > 0 ? v.toFixed(1) : '--' },
  { title: 'ROE', dataIndex: 'roe', key: 'roe', width: 80, render: (v: number) => v > 0 ? `${v.toFixed(1)}%` : '--' },
  {
    title: '排位', dataIndex: 'percentileInIndustry', key: 'percentileInIndustry', width: 80,
    render: (v: number) => percentFormatter.format(v)
  }
]

export function IndustryAnalysisPage() {
  const { data, distribution, loading, error } = useIndustryAnalysis()

  if (loading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 12 }} /></div>
  if (error) return <div style={{ padding: 24 }}><Alert message={error} type="error" /></div>

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24, fontSize: 20, fontWeight: 600 }}>行业分析</h2>

      {distribution.length > 0 && (
        <Row gutter={[20, 20]} style={{ marginBottom: 32 }}>
          <Col xs={24} md={10}>
            <Card title="持仓行业分布" size="small">
              <IndustryDistributionPie distribution={distribution} />
            </Card>
          </Col>
          <Col xs={24} md={14}>
            <Card title="行业概览" size="small">
              <Table
                dataSource={data.map((d) => ({ ...d.summary, key: d.industryName }))}
                columns={[
                  { title: '行业', dataIndex: 'industryName', key: 'industryName' },
                  { title: '样本数', dataIndex: 'stockCount', key: 'stockCount', width: 80 },
                  { title: '平均股息率', dataIndex: 'avgDividendYield', key: 'avgDividendYield', render: (v: number) => percentFormatter.format(v) },
                  { title: '平均PE', dataIndex: 'avgPeRatio', key: 'avgPeRatio', render: (v: number) => v > 0 ? v.toFixed(1) : '--' },
                  { title: '平均ROE', dataIndex: 'avgRoe', key: 'avgRoe', render: (v: number) => v > 0 ? `${v.toFixed(1)}%` : '--' }
                ]}
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      )}

      {data.map((industry) => (
        <Card
          key={industry.industryName}
          title={<><Tag color="blue">{industry.industryName}</Tag> 成分股明细</>}
          style={{ marginBottom: 16 }}
          size="small"
        >
          <Table
            dataSource={industry.stocks.map((s) => ({ ...s, key: s.assetKey }))}
            columns={stockColumns}
            pagination={false}
            size="small"
          />
        </Card>
      ))}
    </div>
  )
}

export default IndustryAnalysisPage
