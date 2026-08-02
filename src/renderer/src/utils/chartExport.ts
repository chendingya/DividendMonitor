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

function downloadDataUrl(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.png`
  anchor.click()
}

/**
 * 在图表图片上方合成独立标题条（白底 + 标的名称/代码文字），
 * 文字位于图表区域之外，不遮挡任何图表内容。
 * 返回合成后的 data URL。
 */
function composeHeaderLabel(baseUrl: string, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const headerHeight = Math.round(image.naturalWidth * 0.033)
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight + headerHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 2d context unavailable'))
          return
        }

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, headerHeight)

        const fontSize = Math.round(headerHeight * 0.36)
        ctx.fillStyle = '#2c2f31'
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
        ctx.textBaseline = 'middle'
        ctx.fillText(label, Math.round(fontSize * 0.8), headerHeight / 2)

        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('failed to compose export image'))
      }
    }
    image.onerror = () => reject(new Error('failed to load chart image'))
    image.src = baseUrl
  })
}

export async function exportChartAsPng(instance: echarts.ECharts | null, filename: string, label?: string): Promise<void> {
  if (!instance) {
    return
  }

  const baseUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const labelText = label?.trim()

  if (!labelText) {
    downloadDataUrl(baseUrl, filename)
    return
  }

  try {
    const composedUrl = await composeHeaderLabel(baseUrl, labelText)
    downloadDataUrl(composedUrl, filename)
  } catch {
    downloadDataUrl(baseUrl, filename)
  }
}
