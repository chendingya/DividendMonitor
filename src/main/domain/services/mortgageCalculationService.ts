export type RepaymentScheduleItem = {
  month: number
  payment: number
  principal: number
  interest: number
  remainingBalance: number
}

export type EqualInstallmentResult = {
  monthlyPayment: number
  totalPayment: number
  totalInterest: number
  schedule: RepaymentScheduleItem[]
}

export type EqualPrincipalResult = {
  firstMonthPayment: number
  totalPayment: number
  totalInterest: number
  schedule: RepaymentScheduleItem[]
}

/** 等额本息：月供恒定，利息逐月递减 */
export function calculateEqualInstallmentLoan(
  loanAmount: number,
  monthlyRate: number,
  totalMonths: number
): EqualInstallmentResult {
  if (totalMonths <= 0 || loanAmount <= 0) {
    throw new Error('贷款金额与期限必须为正数')
  }
  if (monthlyRate < 0) {
    throw new Error('利率不能为负数')
  }

  const monthlyPayment =
    monthlyRate === 0
      ? loanAmount / totalMonths
      : (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) /
        (Math.pow(1 + monthlyRate, totalMonths) - 1)

  const schedule: RepaymentScheduleItem[] = []
  let balance = loanAmount
  let totalInterest = 0

  for (let month = 1; month <= totalMonths; month++) {
    const interest = balance * monthlyRate
    const principal = monthlyPayment - interest
    balance = Math.max(0, balance - principal)
    totalInterest += interest
    schedule.push({ month, payment: monthlyPayment, principal, interest, remainingBalance: balance })
  }

  const totalPayment = monthlyPayment * totalMonths
  return { monthlyPayment, totalPayment, totalInterest, schedule }
}

/** 等额本金：本金恒定，月供逐月递减 */
export function calculateEqualPrincipalLoan(
  loanAmount: number,
  monthlyRate: number,
  totalMonths: number
): EqualPrincipalResult {
  if (totalMonths <= 0 || loanAmount <= 0) {
    throw new Error('贷款金额与期限必须为正数')
  }
  if (monthlyRate < 0) {
    throw new Error('利率不能为负数')
  }

  const monthlyPrincipal = loanAmount / totalMonths
  const schedule: RepaymentScheduleItem[] = []
  let balance = loanAmount
  let totalInterest = 0

  for (let month = 1; month <= totalMonths; month++) {
    const interest = balance * monthlyRate
    const payment = monthlyPrincipal + interest
    balance = Math.max(0, balance - monthlyPrincipal)
    totalInterest += interest
    schedule.push({ month, payment, principal: monthlyPrincipal, interest, remainingBalance: balance })
  }

  return {
    firstMonthPayment: schedule[0]?.payment ?? 0,
    totalPayment: loanAmount + totalInterest,
    totalInterest,
    schedule
  }
}

export type MortgageRequest = {
  totalPrice: number            // 房屋总价（万元）
  downPaymentPercent: number    // 首付比例（%）
  loanYears: number             // 贷款年限（年）
  annualInterestRate: number    // 年利率（%）
  repaymentMethod: 'EQUAL_INSTALLMENT' | 'EQUAL_PRINCIPAL'
}

export type MortgageResult = {
  loanAmount: number            // 贷款金额（万元）
  monthlyPayment?: number       // 等额本息月供（元）
  firstMonthPayment?: number    // 等额本金首月月供（元）
  totalInterest: number         // 利息总额（万元）
  totalPayment: number          // 还款总额（万元）
  interestRatio: number         // 利息占比
  schedule: RepaymentScheduleItem[]
}

export function calculateMortgage(request: MortgageRequest): MortgageResult {
  const { totalPrice, downPaymentPercent, loanYears, annualInterestRate, repaymentMethod } = request

  if (totalPrice <= 0) {
    throw new Error('房屋总价必须为正数')
  }
  if (downPaymentPercent < 0 || downPaymentPercent >= 100) {
    throw new Error('首付比例必须在 0-100 之间')
  }
  if (loanYears <= 0 || loanYears > 50) {
    throw new Error('贷款年限必须在 1-50 年之间')
  }
  if (annualInterestRate < 0) {
    throw new Error('年利率不能为负数')
  }

  const loanAmount = totalPrice * (1 - downPaymentPercent / 100) // 万元
  const monthlyRate = annualInterestRate / 100 / 12
  const totalMonths = loanYears * 12

  if (repaymentMethod === 'EQUAL_PRINCIPAL') {
    const result = calculateEqualPrincipalLoan(loanAmount * 10_000, monthlyRate, totalMonths)
    return {
      loanAmount,
      firstMonthPayment: result.firstMonthPayment,
      totalInterest: result.totalInterest / 10_000,
      totalPayment: result.totalPayment / 10_000,
      interestRatio: result.totalPayment > 0 ? result.totalInterest / result.totalPayment : 0,
      schedule: result.schedule
    }
  }

  const result = calculateEqualInstallmentLoan(loanAmount * 10_000, monthlyRate, totalMonths)
  return {
    loanAmount,
    monthlyPayment: result.monthlyPayment,
    totalInterest: result.totalInterest / 10_000,
    totalPayment: result.totalPayment / 10_000,
    interestRatio: result.totalPayment > 0 ? result.totalInterest / result.totalPayment : 0,
    schedule: result.schedule
  }
}
