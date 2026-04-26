import type { AssetIdentifierDto, AssetType } from '@shared/contracts/api'
import type { FundDetailSource, StockDetailSource } from '@main/adapters/contracts'
import { createAShareDataSource, createFundCatalogDataSource, createFundDetailDataSource } from '@main/adapters'
import type {
  AShareDataSource,
  CoreStockDetailSource,
  FundCatalogDataSource,
  FundDetailDataSource,
  StockValuationSource
} from '@main/adapters/contracts'
import { ValuationRepository } from '@main/repositories/valuationRepository'

export type AssetSearchSource = {
  assetType: AssetType
  market: AssetIdentifierDto['market']
  code: string
  symbol?: string
  name: string
}

export type StockAssetDetailSource = StockDetailSource & {
  kind: 'STOCK'
  identifier: AssetIdentifierDto
}

export type FundAssetDetailSource = FundDetailSource & {
  kind: 'ETF' | 'FUND'
  identifier: AssetIdentifierDto
}

export type AssetDetailSource = StockAssetDetailSource | FundAssetDetailSource

export interface AssetProvider {
  readonly assetType: AssetType
  supports(identifier: AssetIdentifierDto): boolean
  search(keyword: string): Promise<AssetSearchSource[]>
  getDetail(identifier: AssetIdentifierDto): Promise<AssetDetailSource>
  compare?(identifiers: AssetIdentifierDto[]): Promise<AssetDetailSource[]>
}

const sharedValuationRepository = new ValuationRepository()

function mergeStockDetail(source: CoreStockDetailSource, valuation?: StockValuationSource): StockDetailSource {
  return {
    ...source,
    stock: {
      ...source.stock,
      peRatio: valuation?.pe?.currentValue ?? source.stock.peRatio,
      pbRatio: valuation?.pb?.currentValue ?? source.stock.pbRatio
    },
    valuation
  }
}

export class StockAssetProvider implements AssetProvider {
  readonly assetType = 'STOCK' as const

  constructor(
    private readonly dataSource: AShareDataSource = createAShareDataSource(),
    private readonly valuationRepository: ValuationRepository = sharedValuationRepository
  ) {}

  supports(identifier: AssetIdentifierDto) {
    return identifier.assetType === 'STOCK' && identifier.market === 'A_SHARE'
  }

  async search(keyword: string): Promise<AssetSearchSource[]> {
    const items = await this.dataSource.search(keyword)
    return items.map((item) => ({
      assetType: 'STOCK',
      market: item.market,
      code: item.symbol,
      symbol: item.symbol,
      name: item.name
    }))
  }

  async getDetail(identifier: AssetIdentifierDto): Promise<StockAssetDetailSource> {
    if (!this.supports(identifier)) {
      throw new Error(`Unsupported stock asset identifier: ${identifier.assetType}:${identifier.market}:${identifier.code}`)
    }

    const [source, valuation] = await Promise.all([
      this.dataSource.getDetail(identifier.code),
      this.valuationRepository.getStockValuation(identifier.code)
    ])

    return {
      kind: 'STOCK',
      identifier,
      ...mergeStockDetail(source, valuation)
    }
  }

  async compare(identifiers: AssetIdentifierDto[]): Promise<StockAssetDetailSource[]> {
    if (identifiers.length === 0) {
      return []
    }

    const unsupported = identifiers.find((identifier) => !this.supports(identifier))
    if (unsupported) {
      throw new Error(
        `Unsupported stock comparison identifier: ${unsupported.assetType}:${unsupported.market}:${unsupported.code}`
      )
    }

    const symbols = identifiers.map((identifier) => identifier.code)
    const [sources, valuations] = await Promise.all([
      this.dataSource.compare(symbols),
      Promise.all(symbols.map((symbol) => this.valuationRepository.getStockValuation(symbol)))
    ])

    return sources.map((source, index) => ({
      kind: 'STOCK',
      identifier: identifiers[index],
      ...mergeStockDetail(source, valuations[index])
    }))
  }
}

export class EtfAssetProvider implements AssetProvider {
  readonly assetType = 'ETF' as const

  constructor(
    private readonly catalogDataSource: FundCatalogDataSource = createFundCatalogDataSource(),
    private readonly detailDataSource: FundDetailDataSource = createFundDetailDataSource()
  ) {}

  supports(identifier: AssetIdentifierDto) {
    return identifier.assetType === 'ETF' && identifier.market === 'A_SHARE'
  }

  async search(keyword: string): Promise<AssetSearchSource[]> {
    const items = await this.catalogDataSource.search(keyword, 'ETF')
    return items.map((item) => ({
      assetType: item.assetType,
      market: item.market,
      code: item.code,
      name: item.name
    }))
  }

  async getDetail(identifier: AssetIdentifierDto): Promise<FundAssetDetailSource> {
    if (!this.supports(identifier)) {
      throw new Error(`Unsupported ETF asset identifier: ${identifier.assetType}:${identifier.market}:${identifier.code}`)
    }

    const source = await this.detailDataSource.getDetail(identifier.code, 'ETF')
    return {
      kind: 'ETF',
      identifier,
      ...source
    }
  }
}

export class FundAssetProvider implements AssetProvider {
  readonly assetType = 'FUND' as const

  constructor(
    private readonly catalogDataSource: FundCatalogDataSource = createFundCatalogDataSource(),
    private readonly detailDataSource: FundDetailDataSource = createFundDetailDataSource()
  ) {}

  supports(identifier: AssetIdentifierDto) {
    return identifier.assetType === 'FUND' && identifier.market === 'A_SHARE'
  }

  async search(keyword: string): Promise<AssetSearchSource[]> {
    const items = await this.catalogDataSource.search(keyword, 'FUND')
    return items.map((item) => ({
      assetType: item.assetType,
      market: item.market,
      code: item.code,
      name: item.name
    }))
  }

  async getDetail(identifier: AssetIdentifierDto): Promise<FundAssetDetailSource> {
    if (!this.supports(identifier)) {
      throw new Error(`Unsupported fund asset identifier: ${identifier.assetType}:${identifier.market}:${identifier.code}`)
    }

    const source = await this.detailDataSource.getDetail(identifier.code, 'FUND')
    return {
      kind: 'FUND',
      identifier,
      ...source
    }
  }
}

export class AssetProviderRegistry {
  constructor(
    private readonly providers: AssetProvider[] = [new StockAssetProvider(), new EtfAssetProvider(), new FundAssetProvider()]
  ) {}

  getProvider(identifier: AssetIdentifierDto): AssetProvider {
    const provider = this.providers.find((item) => item.supports(identifier))
    if (!provider) {
      throw new Error(`No asset provider found for ${identifier.assetType}:${identifier.market}:${identifier.code}`)
    }
    return provider
  }

  getSearchProviders(assetTypes?: AssetType[]) {
    if (!assetTypes || assetTypes.length === 0) {
      return this.providers
    }

    const allowed = new Set(assetTypes)
    return this.providers.filter((provider) => allowed.has(provider.assetType))
  }
}
