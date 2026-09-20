import type { BacktestResultDto } from '@shared/contracts/api'
import {
  listBacktestResults,
  saveBacktestResult,
  deleteBacktestResult
} from '@main/repositories/backtestResultRepository'

export async function listBacktestHistory() {
  return listBacktestResults()
}

export async function saveBacktestHistory(result: BacktestResultDto, name?: string, dcaConfig?: string) {
  return saveBacktestResult(result, name, dcaConfig)
}

export async function deleteBacktestHistory(id: string) {
  return deleteBacktestResult(id)
}
