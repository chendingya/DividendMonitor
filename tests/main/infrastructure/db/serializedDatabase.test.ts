import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSerializedDatabase } from '@main/infrastructure/db/serializedDatabase'
import type { SqliteExecutor } from '@main/infrastructure/db/databaseTypes'

const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 2))
function delayedDatabase() {
  const native = new DatabaseSync(':memory:')
  native.exec('CREATE TABLE entries (value TEXT NOT NULL)')
  const raw: SqliteExecutor = {
    async exec(sql) { await delay(); native.exec(sql) },
    prepare(sql) {
      const statement = native.prepare(sql)
      return {
        async all(...params) { await delay(); return statement.all(...params) },
        async get(...params) { await delay(); return statement.get(...params) },
        async run(...params) { await delay(); return statement.run(...params) }
      }
    },
    async close() { native.close() }
  }
  return createSerializedDatabase(raw)
}

describe('serialized asynchronous SQLite', () => {
  it('waits for writes before reading committed rows', async () => {
    const db = delayedDatabase()
    const write = db.prepare('INSERT INTO entries VALUES (?)').run('first')
    const read = db.prepare('SELECT value FROM entries').all()
    await write
    expect(await read).toEqual([{ value: 'first' }])
    await db.close()
  })

  it('rolls back a failed transaction and keeps the queue usable', async () => {
    const db = delayedDatabase()
    await expect(db.transaction(async (tx) => {
      await tx.prepare('INSERT INTO entries VALUES (?)').run('discard')
      throw new Error('cancel')
    })).rejects.toThrow('cancel')
    await db.prepare('INSERT INTO entries VALUES (?)').run('keep')
    expect(await db.prepare('SELECT value FROM entries').all()).toEqual([{ value: 'keep' }])
    await db.close()
  })

  it('isolates concurrent transactions and ordinary statements from a rollback', async () => {
    const db = delayedDatabase()
    const failed = db.transaction(async (tx) => {
      await tx.prepare('INSERT INTO entries VALUES (?)').run('discard')
      await delay()
      throw new Error('cancel')
    })
    const succeeding = db.transaction(async (tx) => {
      await tx.prepare('INSERT INTO entries VALUES (?)').run('transaction')
      expect(await tx.prepare('SELECT value FROM entries').all()).toEqual([{ value: 'transaction' }])
    })
    const ordinary = db.prepare('INSERT INTO entries VALUES (?)').run('ordinary')
    await expect(failed).rejects.toThrow('cancel')
    await Promise.all([succeeding, ordinary])
    expect(await db.prepare('SELECT value FROM entries').all()).toEqual([{ value: 'transaction' }, { value: 'ordinary' }])
    await db.close()
  })
})
