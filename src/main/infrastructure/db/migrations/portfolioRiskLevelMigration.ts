import type { DatabaseSync } from 'node:sqlite'

export function migratePortfolioRiskLevelColumn(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(portfolio_positions)').all() as Array<{
    name: string
  }>
  if (columns.some((col) => col.name === 'risk_level')) return

  db.exec('ALTER TABLE portfolio_positions ADD COLUMN risk_level TEXT;')
}
