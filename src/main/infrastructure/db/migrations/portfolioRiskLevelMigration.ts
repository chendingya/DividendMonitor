import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'

export async function migratePortfolioRiskLevelColumn(db: SqliteDatabase): Promise<void> {
  const columns = (await db.prepare('PRAGMA table_info(portfolio_positions)').all()) as Array<{
    name: string
  }>
  if (columns.some((col) => col.name === 'risk_level')) return

  await db.exec('ALTER TABLE portfolio_positions ADD COLUMN risk_level TEXT;')
}
