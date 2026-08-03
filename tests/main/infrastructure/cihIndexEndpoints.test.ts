import { describe, expect, it } from 'vitest'
import { extractCihInitialState, parseCihMarketSnapshot } from '@main/infrastructure/dataSources/registry/cihIndexEndpoints'

const SAMPLE_HTML = `<!doctype html><html><head><title>百城价格指数</title></head><body>
<script>
var _hmt = _hmt || [];
</script>
<script type="text/javascript">
window.__INITIAL_STATE__= {"data":{"pageId":"\/","type":"newHouse","topInfoDate":"2026.07","topInfo":{"average":17229,"averageUnit":"元/平方米","averageHuanBi":0.2619,"averageTongBi":2.0857,"median":9701},"chartData":[{"city":"全国(百城)","average":16910,"averageHuanBi":0.1955,"averageTongBi":2.7277,"date":"2025-08"},{"city":"全国(百城)","average":17229,"averageHuanBi":0.2619,"averageTongBi":2.0857,"date":"2026-07"}],"cityIndexInfo":[{"city":"北京","average":47194,"averageHuanBi":0.16,"averageTongBi":-1.82,"median":45000,"date":"2026年07月"},{"city":"上海","average":64712,"averageHuanBi":0.9591,"averageTongBi":8.428,"median":60609,"date":"2026年07月"}]}}
</script>
</body></html>`

describe('Cih Index endpoint parsing (unit)', () => {
  it('extracts SSR initial state JSON', () => {
    const state = extractCihInitialState(SAMPLE_HTML)
    expect(state.data?.type).toBe('newHouse')
    expect(state.data?.topInfoDate).toBe('2026.07')
    expect(state.data?.topInfo?.average).toBe(17229)
  })

  it('parses market snapshot with cities, trend and national stats', () => {
    const output = parseCihMarketSnapshot(SAMPLE_HTML, 'newHouse')

    expect(output.type).toBe('newHouse')
    expect(output.period).toBe('2026-07')
    expect(output.unit).toBe('元/平方米')
    expect(output.nationalAverage).toBe(17229)
    expect(output.nationalMedian).toBe(9701)
    expect(output.nationalMomPercent).toBe(0.2619)
    expect(output.nationalYoyPercent).toBe(2.0857)

    expect(output.cities).toHaveLength(2)
    expect(output.cities[0]).toEqual({
      city: '北京',
      pricePerSqm: 47194,
      medianPerSqm: 45000,
      momPercent: 0.16,
      yoyPercent: -1.82
    })

    expect(output.trend).toHaveLength(2)
    expect(output.trend[0].period).toBe('2025-08')
    expect(output.trend[1].period).toBe('2026-07')
    expect(output.trend[1].pricePerSqm).toBe(17229)
  })

  it('trend is sorted ascending by period', () => {
    const html = SAMPLE_HTML.replace('"date":"2025-08"', '"date":"2026-07"').replace('"date":"2026-07"}]', '"date":"2026-06"}]')
    const output = parseCihMarketSnapshot(html, 'newHouse')
    expect(output.trend).toHaveLength(2)
    expect(output.trend[0].period).toBe('2026-06')
    expect(output.trend[1].period).toBe('2026-07')
  })

  it('throws when __INITIAL_STATE__ is missing', () => {
    expect(() => extractCihInitialState('<html><body>no state</body></html>')).toThrow('__INITIAL_STATE__')
  })

  it('handles null values and missing optional fields', () => {
    const html = SAMPLE_HTML.replace('"averageHuanBi":0.2619', '"averageHuanBi":null')
      .replace('"median":9701', '"median":null')
      .replace('"average":16910,', '"average":null,')
    const output = parseCihMarketSnapshot(html, 'newHouse')
    expect(output.nationalAverage).toBe(17229)
    expect(output.nationalMomPercent).toBeUndefined()
    expect(output.nationalMedian).toBeUndefined()
    expect(output.trend[0].pricePerSqm).toBeUndefined()
  })
})
