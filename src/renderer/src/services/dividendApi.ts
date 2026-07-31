import { getDividendDesktopApi } from '@renderer/services/desktopApi'
import type {
  DividendHistoryRequest,
  DividendHistoryResult,
  UpcomingDividendDto,
  DividendForecastDto
} from '@shared/contracts/api'

export const dividendApi = {
  getHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult> {
    return getDividendDesktopApi().getHistory(request)
  },
  listUpcoming(): Promise<UpcomingDividendDto[]> {
    return getDividendDesktopApi().listUpcoming()
  },
  getForecast(): Promise<DividendForecastDto> {
    return getDividendDesktopApi().getForecast()
  }
}

export type {
  DividendHistoryRequest,
  DividendHistoryResult,
  UpcomingDividendDto,
  DividendForecastDto
} from '@shared/contracts/api'