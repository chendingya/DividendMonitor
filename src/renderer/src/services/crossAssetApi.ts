import type { CrossAssetComparisonDto } from '@shared/contracts/api'
import { getCrossAssetDesktopApi } from '@renderer/services/desktopApi'

const api = () => getCrossAssetDesktopApi()

export const crossAssetApi = {
  getComparison(): Promise<CrossAssetComparisonDto> {
    return api().getComparison()
  }
}
