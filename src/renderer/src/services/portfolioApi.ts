import type { AssetQueryDto, PortfolioPositionReplaceByAssetDto, PortfolioPositionUpsertDto } from '@shared/contracts/api'
import { getPortfolioDesktopApi } from '@renderer/services/desktopApi'

export const portfolioApi = {
  list() {
    return getPortfolioDesktopApi().list()
  },
  upsert(request: PortfolioPositionUpsertDto) {
    return getPortfolioDesktopApi().upsert(request)
  },
  remove(id: string) {
    return getPortfolioDesktopApi().remove(id)
  },
  removeByAsset(request: AssetQueryDto) {
    return getPortfolioDesktopApi().removeByAsset(request)
  },
  replaceByAsset(request: PortfolioPositionReplaceByAssetDto) {
    return getPortfolioDesktopApi().replaceByAsset(request)
  }
}
