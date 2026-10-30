import { Button, Empty, Tag } from 'antd'
import type { HousingCitySummaryDto } from '@shared/contracts/api'
import './housingMobile.css'

type Props = {
  cities: HousingCitySummaryDto[]
  mutatingCity: string | null
  onView: (city: string) => void
  onToggleWatch: (city: HousingCitySummaryDto) => void
}

export function HousingCityCards({ cities, mutatingCity, onView, onToggleWatch }: Props) {
  if (cities.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配城市" />

  return (
    <div className="housing-city-cards">
      {cities.map((city) => (
        <article className="housing-city-card" key={city.city}>
          <div className="housing-city-card-header">
            <Button type="link" aria-label={`查看房产 ${city.city}`} onClick={() => onView(city.city)}>
              {city.city}
            </Button>
            <Button
              aria-label={`${city.isWatched ? '取消关注' : '关注'} ${city.city}`}
              type={city.isWatched ? 'default' : 'primary'} danger={city.isWatched}
              loading={mutatingCity === city.city} onClick={() => onToggleWatch(city)}
            >{city.isWatched ? '取消关注' : '关注'}</Button>
          </div>
          <dl className="housing-city-card-metrics">
            <div><dt>{city.yieldSource === 'custom' ? '自定义收益率' : '市场租金收益率'}</dt><dd>{city.rentalYieldPercent == null ? '--' : `${city.rentalYieldPercent.toFixed(2)}%`}</dd></div>
            <div><dt>租售比</dt><dd>{city.priceToRentRatio == null ? '--' : `${city.priceToRentRatio.toFixed(1)} 年`}</dd></div>
            <div><dt>市场新建均价</dt><dd>{city.pricePerSqm?.toLocaleString() ?? '--'} 元/㎡</dd></div>
            <div><dt>市场二手均价</dt><dd>{city.secondHandPricePerSqm?.toLocaleString() ?? '--'} 元/㎡</dd></div>
            <div><dt>市场月租金</dt><dd>{city.rentPerSqm?.toFixed(1) ?? '--'} 元/㎡</dd></div>
            <div><dt>收益率口径</dt><dd><Tag color={city.yieldSource === 'custom' ? 'blue' : 'default'}>{city.yieldSource === 'custom' ? '自定义整套金额' : '市场每㎡均价'}</Tag></dd></div>
          </dl>
          {city.yieldSource === 'custom' && city.rentalYieldPercent == null ? <p className="housing-city-card-hint">待补充总价和月租金</p> : null}
          <button type="button" className="ledger-link-button housing-city-card-detail" onClick={() => onView(city.city)}>
            查看走势 / 录入自定义数据 →
          </button>
        </article>
      ))}
    </div>
  )
}
