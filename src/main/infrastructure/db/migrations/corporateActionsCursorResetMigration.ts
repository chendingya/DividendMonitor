import type { DatabaseSync } from 'node:sqlite'

type PositionRow = {
  id: string
  shares: number
  avg_cost: number
  opened_at: string | null
  corporate_actions_applied_until: string | null
  asset_key: string
}

type EventRow = {
  dividend_per_share: number
  bonus_share_per10: number | null
  transfer_share_per10: number | null
  ex_date: string
}

/**
 * 一次性迁移：算法从"简单减法"升级为"除权参考价因子法"。
 *
 * 旧算法（简单减法）：
 *   现金分红：newCost = cost - cash
 *   送转股：  newShares = shares × (1+ratio), newCost = cost / (1+ratio)
 *
 * 新算法（除权参考价因子）：
 *   factor = (收盘价 - 现金分红) / (收盘价 × (1 + 送转比例))
 *   newCost = cost × factor, newShares = shares × (1+ratio)
 *
 * 迁移步骤：
 *   1. 对每个已被旧算法处理的持仓，逆序还原旧算法的扣减（加回现金、还原送转）
 *   2. 重置游标为 NULL
 *   3. 下次 list 时新算法从 openedAt 起重新应用
 */
export function migrateCorporateActionsCursorReset(db: DatabaseSync): void {
  const meta = db.prepare("SELECT value FROM app_settings WHERE key = 'migration:corporate_actions_cursor_reset_v1'").get() as
    | { value: string }
    | undefined
  if (meta) return

  const positions = db.prepare(`
    SELECT id, shares, avg_cost, opened_at, corporate_actions_applied_until, asset_key
    FROM portfolio_positions
    WHERE corporate_actions_applied_until IS NOT NULL
      AND corporate_actions_applied_until != ''
      AND opened_at IS NOT NULL
      AND opened_at != ''
  `).all() as PositionRow[]

  const updateStmt = db.prepare(`
    UPDATE portfolio_positions
    SET shares = ?, avg_cost = ?, corporate_actions_applied_until = NULL
    WHERE id = ?
  `)

  for (const pos of positions) {
    // 查出该持仓在 openedAt ~ cursor 之间被旧算法应用过的所有事件
    const events = db.prepare(`
      SELECT dividend_per_share, bonus_share_per10, transfer_share_per10, ex_date
      FROM dividend_events
      WHERE asset_key = ?
        AND ex_date >= ?
        AND ex_date <= ?
      ORDER BY ex_date DESC
    `).all(pos.asset_key, pos.opened_at!, pos.corporate_actions_applied_until!) as EventRow[]

    let shares = pos.shares
    let avgCost = pos.avg_cost

    // 逆序还原旧算法：先还原现金（加回），再还原送转（缩股、乘回成本）
    for (const event of events) {
      const cash = event.dividend_per_share ?? 0
      const bonusRatio = ((event.bonus_share_per10 ?? 0) + (event.transfer_share_per10 ?? 0)) / 10

      // 旧算法顺序：先送转再现金。逆序还原：先还原现金，再还原送转。
      if (cash > 0) {
        avgCost = avgCost + cash
      }
      if (bonusRatio > 0) {
        shares = shares / (1 + bonusRatio)
        avgCost = avgCost * (1 + bonusRatio)
      }
    }

    updateStmt.run(shares, avgCost, pos.id)
  }

  // 对于没有 openedAt 但有游标的持仓（异常数据），也重置游标
  db.exec(`
    UPDATE portfolio_positions
    SET corporate_actions_applied_until = NULL
    WHERE corporate_actions_applied_until IS NOT NULL
      AND corporate_actions_applied_until != '';
  `)

  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, '1', ?)").run(
    'migration:corporate_actions_cursor_reset_v1',
    new Date().toISOString()
  )
}
