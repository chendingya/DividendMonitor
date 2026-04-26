import type { AssetCompareRequestDto, AssetQueryDto, AssetSearchRequestDto } from '@shared/contracts/api'
import { getAssetDesktopApi } from '@renderer/services/desktopApi'

export const assetApi = {
  search(request: AssetSearchRequestDto) {
    return getAssetDesktopApi().search(request)
  },
  getDetail(request: AssetQueryDto) {
    return getAssetDesktopApi().getDetail(request)
  },
  compare(request: AssetCompareRequestDto) {
    return getAssetDesktopApi().compare(request)
  }
}
