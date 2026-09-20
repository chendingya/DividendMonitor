export type SqliteInputValue = null | number | bigint | string | Uint8Array
export type SqliteOutputValue = null | number | bigint | string | Uint8Array
export type SqliteRow = Record<string, SqliteOutputValue>
export interface SqliteExecutor {
  exec(sql: string): Promise<void>
  prepare(sql: string): {
    all(...params: SqliteInputValue[]): Promise<SqliteRow[]>
    get(...params: SqliteInputValue[]): Promise<SqliteRow | undefined>
    run(...params: SqliteInputValue[]): Promise<{ changes: number | bigint; lastInsertRowid: number | bigint }>
  }
  close(): Promise<void>
}
export interface SqliteDatabase extends SqliteExecutor {
  transaction<T>(work: (tx: SqliteExecutor) => Promise<T>): Promise<T>
}
