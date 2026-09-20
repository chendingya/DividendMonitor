import { describe, expect, it, vi } from 'vitest'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { createNativeSqliteExecutor } from '@main/infrastructure/db/mobileNativeSqliteProvider'
import { createSerializedDatabase } from '@main/infrastructure/db/serializedDatabase'

function nativeConnection() {
  return {
    beginTransaction: vi.fn().mockResolvedValue({ changes: { changes: 0 } }),
    commitTransaction: vi.fn().mockResolvedValue({ changes: { changes: 0 } }),
    rollbackTransaction: vi.fn().mockResolvedValue({ changes: { changes: 0 } }),
    execute: vi.fn().mockResolvedValue({ changes: { changes: 0 } }),
    run: vi.fn().mockResolvedValue({ changes: { changes: 1, lastId: 42 } }),
    query: vi.fn().mockResolvedValue({ values: [{ id: 42, name: '自选' }] }),
    close: vi.fn().mockResolvedValue(undefined)
  }
}

describe('Android SQLite 插件边界', () => {
  it('写入使用外层事务，返回插入 ID，并等待原生查询完成', async () => {
    const connection = nativeConnection()
    const db = createSerializedDatabase(createNativeSqliteExecutor(connection as unknown as SQLiteDBConnection))
    await db.transaction(async (tx) => {
      expect(await tx.prepare('INSERT INTO groups(name) VALUES (?)').run('自选')).toEqual({ changes: 1, lastInsertRowid: 42 })
      expect(await tx.prepare('SELECT * FROM groups WHERE id = ?').get(42n)).toEqual({ id: 42, name: '自选' })
    })
    expect(connection.beginTransaction).toHaveBeenCalledOnce()
    expect(connection.run).toHaveBeenCalledWith('INSERT INTO groups(name) VALUES (?)', ['自选'], false)
    expect(connection.query).toHaveBeenCalledWith('SELECT * FROM groups WHERE id = ?', [42])
    expect(connection.commitTransaction).toHaveBeenCalledOnce()
    expect(connection.execute).not.toHaveBeenCalled()
  })

  it('原生写入失败会回滚并将同一个错误交给调用方', async () => {
    const connection = nativeConnection()
    const failure = new Error('disk full')
    connection.run.mockRejectedValueOnce(failure)
    const db = createSerializedDatabase(createNativeSqliteExecutor(connection as unknown as SQLiteDBConnection))
    await expect(db.transaction(async (tx) => { await tx.prepare('INSERT INTO x VALUES (?)').run(1) })).rejects.toBe(failure)
    expect(connection.rollbackTransaction).toHaveBeenCalledOnce()
    expect(connection.commitTransaction).not.toHaveBeenCalled()
  })

  it('建表不隐式嵌套事务，空查询返回 undefined，拒绝有精度损失的整数', async () => {
    const connection = nativeConnection()
    connection.query.mockResolvedValueOnce({ values: [] })
    const db = createNativeSqliteExecutor(connection as unknown as SQLiteDBConnection)
    await db.exec('CREATE TABLE x (id INTEGER)')
    expect(connection.execute).toHaveBeenCalledWith('CREATE TABLE x (id INTEGER)', false)
    expect(await db.prepare('SELECT * FROM x').get()).toBeUndefined()
    await expect(db.prepare('INSERT INTO x VALUES (?)').run(9007199254740993n)).rejects.toThrow('安全整数')
    expect(connection.run).not.toHaveBeenCalled()
  })
})
