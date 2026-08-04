import type { MortgageRequestDto, MortgageResultDto } from '@shared/contracts/api'
import { calculateMortgage } from '@main/domain/services/mortgageCalculationService'

export function calculateMortgageUseCase(request: MortgageRequestDto): MortgageResultDto {
  return calculateMortgage(request)
}
