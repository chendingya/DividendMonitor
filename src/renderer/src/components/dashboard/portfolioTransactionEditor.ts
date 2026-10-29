import type { PortfolioRow, PortfolioTransaction } from '@renderer/hooks/usePortfolio'
import type { PortfolioPosition } from '@renderer/services/portfolioStore'
import type { PortfolioEditorInitialValues, PortfolioEditorSubmitValues } from './PortfolioPositionEditorModal'

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
      openedAt: transaction.openedAt,
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
