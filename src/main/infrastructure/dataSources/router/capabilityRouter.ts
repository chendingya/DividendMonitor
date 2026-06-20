import type {
  Capability,
  RouteContext,
  RoutePlan
} from '@main/infrastructure/dataSources/types/sourceTypes'

export class CapabilityRouter {
  resolve(capability: Capability, context: RouteContext = {}): RoutePlan {
    switch (capability) {
      case 'asset.search':
        return {
          primary: 'eastmoney',
          fallbacks: [],
          degradeMode: 'fallback'
        }
      case 'benchmark.kline':
        return {
          primary: 'tencent',
          fallbacks: [],
          degradeMode: 'fallback'
        }
      case 'asset.kline':
        return {
          primary: context.assetType === 'ETF' ? 'tencent' : 'eastmoney',
          fallbacks: context.assetType === 'ETF' ? ['sina'] : ['sina'],
          degradeMode: 'stale-while-error'
        }
      case 'asset.quote':
        if (context.assetType === 'GOLD' || context.assetType === 'SILVER') {
          return {
            primary: 'sina',
            fallbacks: [],
            degradeMode: 'fallback'
          }
        }
        return {
          primary: context.assetType === 'STOCK' ? 'tencent' : 'eastmoney',
          fallbacks: context.assetType === 'STOCK' ? ['eastmoney'] : ['tencent'],
          degradeMode: 'fallback'
        }
      case 'asset.profile':
      case 'asset.dividend':
      case 'valuation.snapshot':
      case 'valuation.percentile':
      case 'valuation.trend':
        return {
          primary: 'eastmoney',
          fallbacks: [],
          degradeMode: 'fallback'
        }
      case 'fx.quote':
        return {
          primary: 'sina',
          fallbacks: [],
          degradeMode: 'fallback'
        }
      default:
        return {
          primary: 'eastmoney',
          fallbacks: [],
          degradeMode: 'strict'
        }
    }
  }
}
