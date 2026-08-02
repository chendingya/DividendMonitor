import { describe, expect, it } from 'vitest'
import { buildCsv } from '@renderer/utils/chartExport'

describe('buildCsv', () => {
  it('builds header row from first row keys', () => {
    const csv = buildCsv([{ name: 'A', value: 1 }])
    expect(csv.split('\n')[0]).toBe('name,value')
  })

  it('joins values in order of header keys', () => {
    const csv = buildCsv([
      { name: 'A', value: 1 },
      { name: 'B', value: 2 }
    ])
    expect(csv.split('\n')[1]).toBe('A,1')
    expect(csv.split('\n')[2]).toBe('B,2')
  })

  it('quotes values containing comma, quote or newline', () => {
    const csv = buildCsv([{ text: 'a,b', quote: 'say "hi"', multi: 'line1\nline2' }])
    expect(csv).toBe('text,quote,multi\n"a,b","say ""hi""","line1\nline2"')
  })

  it('renders null and undefined as empty', () => {
    const csv = buildCsv([{ a: null, b: undefined, c: 0 }])
    expect(csv.split('\n')[1]).toBe(',,0')
  })

  it('returns empty string for empty rows', () => {
    expect(buildCsv([])).toBe('')
  })
})
