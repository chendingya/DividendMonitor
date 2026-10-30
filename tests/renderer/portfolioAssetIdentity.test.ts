import { describe, expect, it } from 'vitest'
import type { AssetSearchItemDto } from '@shared/contracts/api'
import { createPortfolioEditorInitialValues, pickBestSearchResult } from '@renderer/components/dashboard/portfolioAssetIdentity'

const stock: AssetSearchItemDto = {
  assetKey: 'STOCK:A_SHARE:000001', assetType: 'STOCK', market: 'A_SHARE',
  code: '000001', symbol: '000001', name: '平安银行'
}
const fund: AssetSearchItemDto = {
  assetKey: 'FUND:A_SHARE:000001', assetType: 'FUND', market: 'A_SHARE',
  code: '000001', name: '华夏成长混合'
}

describe('持仓录入资产匹配', () => {
  it('工作台新建持仓的默认初值允许自动识别SGE黄金，不隐含A_SHARE市场限制', () => {
    const initialValues = createPortfolioEditorInitialValues()
    const gold: AssetSearchItemDto = { assetKey: 'GOLD:SGE:AU9999', assetType: 'GOLD', market: 'SGE', code: 'AU9999', name: '黄金99.99' }
    expect(pickBestSearchResult('AU9999', [gold], initialValues.assetType, initialValues.market)).toEqual(gold)
  })

  it('股票与基金同码时不自动取搜索首条', () => {
    expect(pickBestSearchResult('000001', [stock, fund])).toBeUndefined()
  })

  it('数字代码在未选类型且部分数据源失败时不自动认作唯一股票', () => {
    expect(pickBestSearchResult('000001', [{ ...stock, searchIncomplete: true }])).toBeUndefined()
  })

  it('仅选择A股市场仍不能排除未返回的同码基金', () => {
    expect(pickBestSearchResult('000001', [{ ...stock, searchIncomplete: true }], undefined, 'A_SHARE')).toBeUndefined()
  })

  it('部分搜索失败时仍尊重明确选择的股票类型', () => {
    expect(pickBestSearchResult('000001', [{ ...stock, searchIncomplete: true }], 'STOCK', 'A_SHARE')).toEqual({ ...stock, searchIncomplete: true })
  })

  it('完整搜索只有一个数字代码命中时可自动识别', () => {
    expect(pickBestSearchResult('000001', [stock])).toEqual(stock)
  })

  it.each([
    { assetKey: 'GOLD:SGE:AU9999', assetType: 'GOLD' as const, market: 'SGE' as const, code: 'AU9999', name: '黄金99.99', searchIncomplete: true },
    { assetKey: 'SILVER:SGE:AG9999', assetType: 'SILVER' as const, market: 'SGE' as const, code: 'AG9999', name: '白银99.99', searchIncomplete: true }
  ])('部分数据源失败时仍能识别本地金属代码 $code', (metal) => {
    expect(pickBestSearchResult(metal.code.toLowerCase(), [metal])).toEqual(metal)
  })

  it('同码时尊重用户选定的基金类型', () => {
    expect(pickBestSearchResult('000001', [stock, fund], 'FUND', 'A_SHARE')).toEqual(fund)
  })

  it('用户选择的市场不匹配时不取其他市场结果', () => {
    expect(pickBestSearchResult('000001', [stock], 'STOCK', 'SGE')).toBeUndefined()
  })

  it('名称有多个前缀匹配时要求进一步选择，不静默录入首条', () => {
    expect(pickBestSearchResult('华夏', [fund, { ...fund, code: '000002', assetKey: 'FUND:A_SHARE:000002', name: '华夏回报' }])).toBeUndefined()
  })

  it('代码匹配不区分大小写，支持贵金属手机小写输入', () => {
    const gold: AssetSearchItemDto = { assetKey: 'GOLD:SGE:AU9999', assetType: 'GOLD', market: 'SGE', code: 'AU9999', name: '黄金99.99' }
    expect(pickBestSearchResult('au9999', [stock, gold])).toEqual(gold)
  })

  it('没有相关匹配时不误录其他搜索结果', () => {
    expect(pickBestSearchResult('不存在的资产', [stock])).toBeUndefined()
  })

  it('准确名称优先于宽泛名称前缀', () => {
    expect(pickBestSearchResult('平安银行', [{ ...stock, name: '平安银行优选' }, stock])).toEqual(stock)
  })
})
