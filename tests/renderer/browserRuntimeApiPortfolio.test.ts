import { beforeEach, describe, expect, it } from 'vitest'

import { browserRuntimeApi } from '@renderer/services/browserRuntimeApi'

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string) {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

const fund = (code: string, name: string) => ({
  id: `id-${code}`,
  assetKey: `FUND:A_SHARE:${code}`,
  assetType: 'FUND' as const,
  market: 'A_SHARE' as const,
  code,
  name,
  direction: 'BUY' as const,
  shares: 100,
  avgCost: 1.2345,
  openedAt: '2025-04-07',
  tradePrice: 1.2
})

describe('browserRuntimeApi.portfolio（浏览器预览/mock 运行时）', () => {
  beforeEach(() => {
    const storage = new MemoryStorage()
    ;(globalThis as typeof globalThis & { window: { localStorage: MemoryStorage } }).window = {
      localStorage: storage
    }
  })

  it('场外基金导入后保留 assetType / assetKey / openedAt / tradePrice，不再被标成股票', async () => {
    await browserRuntimeApi.portfolio.upsert(fund('000218', '国泰黄金ETF联接A'))

    const list = await browserRuntimeApi.portfolio.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      assetKey: 'FUND:A_SHARE:000218',
      assetType: 'FUND',
      market: 'A_SHARE',
      code: '000218',
      openedAt: '2025-04-07',
      tradePrice: 1.2,
      shares: 100,
      avgCost: 1.2345
    })
    expect(list[0].symbol).toBeUndefined()
  })

  it('非 6/0/3 开头的场外基金代码不会被 A 股代码格式过滤', async () => {
    await browserRuntimeApi.portfolio.upsert(fund('110007', '易方达稳健收益债券A'))
    await browserRuntimeApi.portfolio.upsert(fund('206018', '鹏华产业债债券A'))

    const list = await browserRuntimeApi.portfolio.list()
    expect(list.map((item) => item.code).sort()).toEqual(['110007', '206018'])
    expect(list.every((item) => item.assetType === 'FUND')).toBe(true)
  })

  it('股票持仓仍使用 STOCK:A_SHARE 标识并保留 symbol', async () => {
    await browserRuntimeApi.portfolio.upsert({
      id: 'id-stock',
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      symbol: '600519',
      name: '贵州茅台',
      direction: 'BUY',
      shares: 100,
      avgCost: 1600,
      openedAt: '2024-01-02'
    })

    const list = await browserRuntimeApi.portfolio.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      symbol: '600519',
      openedAt: '2024-01-02'
    })
  })

  it('重复 upsert 同一 id 时按 id 覆盖，不新增记录', async () => {
    const first = fund('009051', '易方达中证红利ETF联接A')
    await browserRuntimeApi.portfolio.upsert(first)
    await browserRuntimeApi.portfolio.upsert({ ...first, shares: 200, openedAt: '2025-05-01' })

    const list = await browserRuntimeApi.portfolio.list()
    expect(list).toHaveLength(1)
    expect(list[0].shares).toBe(200)
    expect(list[0].openedAt).toBe('2025-05-01')
    expect(list[0].assetKey).toBe('FUND:A_SHARE:009051')
  })
})
