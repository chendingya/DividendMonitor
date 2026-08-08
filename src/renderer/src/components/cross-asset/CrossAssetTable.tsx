import type { CrossAssetPointDto } from '@shared/contracts/api'

type Props = {
  points: CrossAssetPointDto[]
  onSelect: (point: CrossAssetPointDto) => void
}

function Row({ point, onSelect }: { point: CrossAssetPointDto; onSelect: (point: CrossAssetPointDto) => void }) {
  const kindLabel = point.kind === 'stock' ? '股票/ETF/基金' : '房产'
  return (
    <button
      type="button"
      className="cross-asset-table-row"
      onClick={() => onSelect(point)}
    >
      <span className="cross-asset-table-cell is-name">
        <span className={`cross-asset-kind-dot is-${point.kind}`} />
        {point.name}
      </span>
      <span className="cross-asset-table-cell">{kindLabel}</span>
      <span className="cross-asset-table-cell is-numeric">
        {point.yieldPercent == null ? '--' : `${point.yieldPercent.toFixed(2)}%`}
        {point.yieldLabel ? <small> {point.yieldLabel}</small> : null}
      </span>
      <span className="cross-asset-table-cell is-numeric">
        {point.volatilityPercent == null ? '暂无数据' : `${point.volatilityPercent.toFixed(2)}%`}
      </span>
      <span className="cross-asset-table-cell is-sub">{point.subInfo ?? ''}</span>
    </button>
  )
}

export function CrossAssetTable({ points, onSelect }: Props) {
  if (points.length === 0) {
    return (
      <div className="ledger-empty-hint" style={{ padding: '28px 16px', textAlign: 'center', color: '#8b949e' }}>
        暂无数据
      </div>
    )
  }

  return (
    <div className="cross-asset-table">
      <div className="cross-asset-table-header">
        <span className="cross-asset-table-cell is-name">名称</span>
        <span className="cross-asset-table-cell">类型</span>
        <span className="cross-asset-table-cell is-numeric">收益率</span>
        <span className="cross-asset-table-cell is-numeric">年化波动率</span>
        <span className="cross-asset-table-cell is-sub">备注</span>
      </div>
      {points.map((point) => (
        <Row key={point.id} point={point} onSelect={onSelect} />
      ))}
    </div>
  )
}
