import { Tooltip } from 'antd'
import type { MutableRefObject } from 'react'
import type * as echarts from 'echarts'
import { exportChartAsPng } from '@renderer/utils/chartExport'

type ChartExportButtonProps = {
  instanceRef: MutableRefObject<echarts.ECharts | null>
  filename: string
  label?: string
}

export function ChartExportButton({ instanceRef, filename, label }: ChartExportButtonProps) {
  return (
    <Tooltip title="导出图片">
      <button
        type="button"
        onClick={() => exportChartAsPng(instanceRef.current, filename, label)}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(171, 173, 175, 0.4)',
          borderRadius: 6,
          background: 'rgba(255, 255, 255, 0.9)',
          color: '#66707a',
          cursor: 'pointer'
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </Tooltip>
  )
}
