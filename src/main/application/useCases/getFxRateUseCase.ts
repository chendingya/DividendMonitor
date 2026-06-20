import { createFxDataSource } from '@main/adapters'

export async function getUsdCnyRate(): Promise<number> {
  const fxDataSource = createFxDataSource()
  const rate = await fxDataSource.getRate('USDCNH')
  return rate.rate
}
