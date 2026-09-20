import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { BacktestResultDto } from '@shared/contracts/api'

export type SavedBacktestResult = {
  id: string
  name: string
  assetKey: string
  buyDate: string
  dcaConfig: string | null
  resultJson: string
  createdAt: string
}

function rowToDto(row: SavedBacktestResult): (SavedBacktestResult & { result: BacktestResultDto }) | null {
  try {
    return {
      ...row,
      result: JSON.parse(row.resultJson) as BacktestResultDto
    }
  } catch {
    console.warn(`[BacktestResult] Failed to parse result JSON for ${row.id}`)
    return null
  }
}

export async function listBacktestResults(): Promise<Array<SavedBacktestResult & { result: BacktestResultDto }>> {
  const db = getDatabase()
  const rows = (await db.prepare(
    'SELECT id, name, asset_key, buy_date, dca_config, result_json, created_at FROM backtest_results ORDER BY created_at DESC'
  ).all()) as Array<{
    id: string
    name: string
    asset_key: string
    buy_date: string
    dca_config: string | null
    result_json: string
    created_at: string
  }>

  return rows
    .map((row) => rowToDto({
      id: row.id,
      name: row.name,
      assetKey: row.asset_key,
      buyDate: row.buy_date,
      dcaConfig: row.dca_config,
      resultJson: row.result_json,
      createdAt: row.created_at
    }))
    .filter((dto): dto is NonNullable<typeof dto> => dto != null)
}

export async function saveBacktestResult(
  result: BacktestResultDto,
  name?: string,
  dcaConfig?: string
): Promise<SavedBacktestResult & { result: BacktestResultDto }> {
  const db = getDatabase()
  const id = globalThis.crypto.randomUUID()
  const now = new Date().toISOString()
  const assetKey = result.assetKey ?? ''
  const resultJson = JSON.stringify(result)

  await db.prepare(
    'INSERT INTO backtest_results (id, name, asset_key, buy_date, dca_config, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name ?? '', assetKey, result.buyDate, dcaConfig ?? null, resultJson, now)

  return rowToDto({
    id,
    name: name ?? '',
    assetKey,
    buyDate: result.buyDate,
    dcaConfig: dcaConfig ?? null,
    resultJson,
    createdAt: now
  })!
}

export async function deleteBacktestResult(id: string): Promise<boolean> {
  const db = getDatabase()
  const result = (await db.prepare('DELETE FROM backtest_results WHERE id = ?').run(id))
  return result.changes > 0
}
