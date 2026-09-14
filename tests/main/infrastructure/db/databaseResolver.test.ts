import { beforeEach, describe, expect, it } from 'vitest'

const { getDatabase, setDatabaseResolver, resetDatabaseResolver } = await import(
  '@main/infrastructure/db/sqlite'
)

describe('数据库 resolver 注入', () => {
  beforeEach(() => {
    resetDatabaseResolver()
  })

  it('未安装 resolver 时 getDatabase 抛出可识别错误', () => {
    expect(() => getDatabase()).toThrow('数据库未初始化')
  })

  it('安装 resolver 后 getDatabase 返回 resolver 提供的实例并缓存', () => {
    const marker = { __marker: true } as unknown as import('node:sqlite').DatabaseSync
    let calls = 0
    setDatabaseResolver(() => {
      calls += 1
      return marker
    })

    expect(getDatabase()).toBe(marker)
    expect(getDatabase()).toBe(marker)
    expect(calls).toBe(1)
  })
})
