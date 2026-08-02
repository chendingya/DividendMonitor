import * as echarts from 'echarts'

export function buildCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return ''
  }

  const header = Object.keys(rows[0])
  const escape = (value: unknown): string => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const lines = [
    header.join(','),
    ...rows.map((row) => header.map((key) => escape(row[key])).join(','))
  ]
  return lines.join('\n')
}

export function exportRowsAsCsv(rows: Array<Record<string, unknown>>, filename: string): void {
  if (rows.length === 0) {
    return
  }

  const csv = buildCsv(rows)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, new TextEncoder().encode(csv)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function exportChartAsPng(instance: echarts.ECharts | null, filename: string): void {
  if (!instance) {
    return
  }

  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.png`
  anchor.click()
}
