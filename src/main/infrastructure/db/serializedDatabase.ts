import type { SqliteDatabase, SqliteExecutor } from './databaseTypes'

/** One connection owns one queue: transactions retain the queue until commit or rollback. */
export function createSerializedDatabase(raw: SqliteExecutor): SqliteDatabase {
  let tail: Promise<unknown> = Promise.resolve()
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work)
    tail = result.catch(() => undefined)
    return result
  }
  return {
    exec: (sql) => enqueue(() => raw.exec(sql)),
    prepare: (sql) => ({
      all: (...params) => enqueue(() => raw.prepare(sql).all(...params)),
      get: (...params) => enqueue(() => raw.prepare(sql).get(...params)),
      run: (...params) => enqueue(() => raw.prepare(sql).run(...params))
    }),
    close: () => enqueue(() => raw.close()),
    transaction: (work) => enqueue(async () => {
      await raw.exec('BEGIN')
      try {
        const result = await work(raw)
        await raw.exec('COMMIT')
        return result
      } catch (error) {
        try { await raw.exec('ROLLBACK') } catch { /* Preserve the operation error. */ }
        throw error
      }
    })
  }
}
