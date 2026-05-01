import type { BacktestResultDto } from '@shared/contracts/api'
import {
  listBacktestResults,
  saveBacktestResult,
  deleteBacktestResult
} from '@main/repositories/backtestResultRepository'

export function listBacktestHistory() {
  return listBacktestResults()
}

export function saveBacktestHistory(result: BacktestResultDto, name?: string, dcaConfig?: string) {
  return saveBacktestResult(result, name, dcaConfig)
}

export function deleteBacktestHistory(id: string) {
  return deleteBacktestResult(id)
}
