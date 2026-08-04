import { describe, expect, it } from 'vitest'
import {
  calculateEqualInstallmentLoan,
  calculateEqualPrincipalLoan,
  calculateMortgage
} from '@main/domain/services/mortgageCalculationService'

describe('mortgageCalculationService', () => {
  describe('calculateEqualInstallmentLoan', () => {
    it('computes monthly payment for 100万/30年/3.1%', () => {
      // 贷款 100 万，年利率 3.1%，30 年等额本息
      const result = calculateEqualInstallmentLoan(1_000_000, 0.031 / 12, 360)

      // 月供 = 4270.16 元（标准等额本息公式）
      expect(result.monthlyPayment).toBeCloseTo(4270.16, 1)
      expect(result.totalPayment).toBeCloseTo(result.monthlyPayment * 360, 0)
      expect(result.totalInterest).toBeCloseTo(result.totalPayment - 1_000_000, 0)
    })

    it('schedule ends with zero balance', () => {
      const result = calculateEqualInstallmentLoan(1_000_000, 0.031 / 12, 360)
      const last = result.schedule[result.schedule.length - 1]
      expect(last.remainingBalance).toBeLessThan(1)
      expect(result.schedule).toHaveLength(360)
    })

    it('zero interest rate produces equal principal portions', () => {
      const result = calculateEqualInstallmentLoan(600_000, 0, 120)
      expect(result.monthlyPayment).toBeCloseTo(5000, 6)
      expect(result.totalInterest).toBe(0)
    })
  })

  describe('calculateEqualPrincipalLoan', () => {
    it('first payment higher than last', () => {
      const result = calculateEqualPrincipalLoan(1_000_000, 0.031 / 12, 360)

      const first = result.schedule[0]
      const last = result.schedule[result.schedule.length - 1]
      expect(first.payment).toBeGreaterThan(last.payment)
      expect(first.principal).toBeCloseTo(1_000_000 / 360, 6)
      expect(last.remainingBalance).toBeLessThan(1)
    })

    it('interest totals less than equal-installment for same terms', () => {
      const principal = 1_000_000
      const install = calculateEqualInstallmentLoan(principal, 0.031 / 12, 360)
      const principalBased = calculateEqualPrincipalLoan(principal, 0.031 / 12, 360)

      expect(principalBased.totalInterest).toBeLessThan(install.totalInterest)
    })
  })

  describe('calculateMortgage', () => {
    const request = {
      totalPrice: 300,          // 万元
      downPaymentPercent: 30,   // 首付 30%
      loanYears: 30,
      annualInterestRate: 3.1,  // 年利率 %
      repaymentMethod: 'EQUAL_INSTALLMENT' as const
    }

    it('computes loan amount after down payment', () => {
      const result = calculateMortgage(request)
      expect(result.loanAmount).toBeCloseTo(210, 6) // 300 × 70% = 210 万
      expect(result.monthlyPayment).toBeGreaterThan(0)
      expect(result.totalPayment).toBeCloseTo(result.loanAmount + result.totalInterest, 4)
      expect(result.interestRatio).toBeCloseTo(result.totalInterest / result.totalPayment, 6)
    })

    it('supports equal principal method', () => {
      const result = calculateMortgage({ ...request, repaymentMethod: 'EQUAL_PRINCIPAL' })
      expect(result.firstMonthPayment).toBeGreaterThan(0)
      expect(result.firstMonthPayment).toBeGreaterThan(result.monthlyPayment ?? 0)
      expect(result.schedule).toHaveLength(360)
    })

    it('validates inputs', () => {
      expect(() => calculateMortgage({ ...request, loanYears: 0 })).toThrow()
      expect(() => calculateMortgage({ ...request, annualInterestRate: -1 })).toThrow()
    })
  })
})
