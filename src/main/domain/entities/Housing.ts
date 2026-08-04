export type HousingIndexRecord = {
  reportDate: string        // YYYY-MM
  city: string
  newHomeMoM?: number       // 新建住宅环比（上月=100）
  newHomeYoY?: number       // 新建住宅同比（上年同月=100）
  secondHandMoM?: number    // 二手住宅环比（上月=100）
  secondHandYoY?: number    // 二手住宅同比（上年同月=100）
}

export type HousingCitySnapshot = {
  city: string
  pricePerSqm?: number      // 样本均价/租金（元/㎡ 或 元/㎡·月）
  medianPerSqm?: number
  momPercent?: number       // 环比涨跌幅（%）
  yoyPercent?: number       // 同比涨跌幅（%）
}

export type HousingMarketTrendPoint = {
  period: string            // YYYY-MM
  pricePerSqm?: number
  momPercent?: number
  yoyPercent?: number
}

export type UserHousingData = {
  cityCode: string
  district?: string
  community?: string
  pricePerSqm?: number      // 用户录入房价（元/㎡）
  rentPerSqm?: number       // 用户录入月租金（元/㎡·月）
  note?: string
  updatedAt: string
}
