import type { PortfolioRow, PortfolioTransaction } from '@renderer/hooks/usePortfolio'
import type { PortfolioPosition } from '@renderer/services/portfolioStore'
import type { PortfolioEditorInitialValues, PortfolioEditorSubmitValues } from './PortfolioPositionEditorModal'
import { normalizeCalendarDate } from '@renderer/utils/calendarDate'

export function calculatePortfolioEditorCost(input: {
  mode: 'create' | 'edit'
  direction?: 'BUY' | 'SELL'
  initialValues: { shares: number; avgCost: number; originalAvgCost?: number; tradePrice?: number; direction?: 'BUY' | 'SELL' }
  shares: number
  price: number
  commissionRate: number
  minCommission: number
}) {
  const tradeAmount = input.price * input.shares
  if (input.mode === 'edit' && input.price === input.initialValues.avgCost
    && (input.direction ?? 'BUY') === (input.initialValues.direction ?? 'BUY')
    && (input.initialValues.tradePrice == null || input.shares === input.initialValues.shares)) {
    return {
      tradeAmount, commission: 0,
      trueCost: input.initialValues.originalAvgCost ?? input.initialValues.avgCost,
      tradePrice: input.initialValues.tradePrice, preserved: true
    }
  }
  const commission = Math.max(tradeAmount * input.commissionRate, input.minCommission)
  const netAmount = input.direction === 'SELL' ? tradeAmount - commission : tradeAmount + commission
  return { tradeAmount, commission, trueCost: netAmount / input.shares, tradePrice: input.price, preserved: false }
}

export function createPortfolioTransactionEdit(
  record: PortfolioRow,
  transaction: PortfolioTransaction
): { id: string; initialValues: PortfolioEditorInitialValues } {
  return {
    id: transaction.id,
    initialValues: {
      assetKey: record.assetKey,
      assetType: record.assetType,
      market: record.market,
      code: record.code,
      symbol: record.symbol ?? '',
      name: record.name,
      direction: transaction.direction,
      shares: transaction.shares,
      avgCost: transaction.tradePrice ?? transaction.avgCost,
      originalAvgCost: transaction.avgCost,
      tradePrice: transaction.tradePrice,
      openedAt: normalizeCalendarDate(transaction.openedAt),
      riskLevel: transaction.riskLevel
    }
  }
}

export function createPortfolioPositionEditRequest(
  record: PortfolioRow,
  values: PortfolioEditorSubmitValues
): Omit<PortfolioPosition, 'updatedAt'> {
  return {
    id: record.id,
    assetKey: values.assetKey || record.assetKey,
    assetType: values.assetType ?? record.assetType,
    market: values.market ?? record.market,
    code: values.code ?? record.code,
    symbol: values.symbol ?? record.symbol,
    name: values.name?.trim() || record.name || '未命名标的',
    direction: values.direction ?? record.direction ?? 'BUY',
    shares: values.shares,
    avgCost: values.avgCost,
    tradePrice: values.tradePrice,
    riskLevel: values.riskLevel,
    openedAt: values.openedAt
  }
}
