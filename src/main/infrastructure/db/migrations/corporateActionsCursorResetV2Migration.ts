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
  reference_close_price: number
}

/**
 * 一次性迁移：算法从「除权参考价因子法」改回「简单减法（会计成本基础调整）」。
 *
 * 旧算法（因子法，v1 后生效）：
 *   factor = (登记日收盘价 - 现金分红) / (登记日收盘价 × (1 + 送转比例))
 *   newCost = oldCost × factor, newShares = oldShares × (1 + 送转比例)
 *
 * 新算法（简单减法，本次启用）：
 *   现金分红：newCost = oldCost - 每股现金分红
 *   送转股：  newShares = oldShares × (1 + 送转比例), newCost = oldCost / (1 + 送转比例)
 *
 * 迁移步骤：
 *   1. 对每个被因子法应用过的持仓，逆序还原因子法（avgCost ÷ factor, shares ÷ (1 + 送转)）
 *   2. 重置游标为 NULL
 *   3. 下次 listPortfolioPositions 时简单减法版 apply 从 openedAt 起重新应用
 *
 * 因子法只在 reference_close_price > 0 时生效；缺失时旧代码走 fallback（与简单减法同形），
 * 此时反演只需逆序加回 cash 与缩股份。
 */
export function migrateCorporateActionsCursorResetV2(db: DatabaseSync): void {
  const meta = db
    .prepare("SELECT value FROM app_settings WHERE key = 'migration:corporate_actions_cursor_reset_v2'")
    .get() as { value: string } | undefined
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
    const events = db.prepare(`
      SELECT dividend_per_share, bonus_share_per10, transfer_share_per10, ex_date, reference_close_price
      FROM dividend_events
      WHERE asset_key = ?
        AND ex_date >= ?
        AND ex_date <= ?
      ORDER BY ex_date DESC
    `).all(pos.asset_key, pos.opened_at!, pos.corporate_actions_applied_until!) as EventRow[]

    let shares = pos.shares
    let avgCost = pos.avg_cost

    // 逆序还原因子法：按 ex_date DESC 反演每一步调整。
    for (const event of events) {
      const cash = event.dividend_per_share ?? 0
      const bonusRatio = ((event.bonus_share_per10 ?? 0) + (event.transfer_share_per10 ?? 0)) / 10
      if (cash === 0 && bonusRatio === 0) continue

      const ref = event.reference_close_price
      if (ref > 0) {
        // 因子法分支反演：avgCost /= factor，shares /= (1 + bonusRatio)
        const factorDenominator = ref - cash
        if (factorDenominator === 0) continue // 边界，跳过避免除 0
        const factor = factorDenominator / (ref * (1 + bonusRatio))
        if (factor === 0) continue
        avgCost = avgCost / factor
        shares = shares / (1 + bonusRatio)
      } else {
        // fallback 简单减法分支反演（与 v1 相同）：
        //   先还原现金（加回），再还原送转（缩股、乘回成本）
        if (cash > 0) {
          avgCost = avgCost + cash
        }
        if (bonusRatio > 0) {
          shares = shares / (1 + bonusRatio)
          avgCost = avgCost * (1 + bonusRatio)
        }
      }
    }

    updateStmt.run(shares, avgCost, pos.id)
  }

  // 对没有 openedAt 但有 cursor 的异常持仓，也重置游标
  db.exec(`
    UPDATE portfolio_positions
    SET corporate_actions_applied_until = NULL
    WHERE corporate_actions_applied_until IS NOT NULL
      AND corporate_actions_applied_until != '';
  `)

  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, '1', ?)").run(
    'migration:corporate_actions_cursor_reset_v2',
    new Date().toISOString()
  )
}