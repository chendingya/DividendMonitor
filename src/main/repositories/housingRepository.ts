import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { HousingIndexRecord, UserHousingData } from '@main/domain/entities/Housing'

export type HousingWatchCityRecord = {
  cityCode: string
  cityName: string
  addedAt: string
}

/** 房价指数 SQLite 持久缓存 TTL（月度数据，30 天刷新一次） */
export const HOUSING_INDEX_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 70 城房价指数持久缓存仓储（本地 SQLite）。
 * 读取优先本地（30 天 TTL），未命中/过期才回源东财；抓取失败时允许回退过期缓存。
 */
export class HousingIndexCacheRepository {
  /**
   * 查询某城市的指数缓存；整体过期（任一月超过 TTL）或不存在时返回 undefined。
   * allowStale 为 true 时忽略 TTL（用于回源失败兜底）。
   */
  findByCity(cityCode: string, options: { allowStale?: boolean } = {}): HousingIndexRecord[] | undefined {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT city_code, period, new_home_index_mom, new_home_index_yoy,
                second_hand_index_mom, second_hand_index_yoy, fetched_at
         FROM housing_index_cache WHERE city_code = ? ORDER BY period`
      )
      .all(cityCode) as Array<Record<string, string | number | null>>
    if (rows.length === 0) return undefined

    if (!options.allowStale) {
      const newestFetchedAt = Math.max(...rows.map((row) => new Date(String(row.fetched_at)).getTime()))
      if (Date.now() - newestFetchedAt > HOUSING_INDEX_CACHE_TTL_MS) {
        return undefined
      }
    }

    return rows.map((row) => ({
      reportDate: String(row.period),
      city: cityCode,
      newHomeMoM: row.new_home_index_mom != null ? Number(row.new_home_index_mom) : undefined,
      newHomeYoY: row.new_home_index_yoy != null ? Number(row.new_home_index_yoy) : undefined,
      secondHandMoM: row.second_hand_index_mom != null ? Number(row.second_hand_index_mom) : undefined,
      secondHandYoY: row.second_hand_index_yoy != null ? Number(row.second_hand_index_yoy) : undefined
    }))
  }

  /** 全量覆盖某城市缓存（先删后插，保证与回源数据一致） */
  upsertMany(cityCode: string, records: HousingIndexRecord[]): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('DELETE FROM housing_index_cache WHERE city_code = ?').run(cityCode)
    const insert = db.prepare(
      `INSERT INTO housing_index_cache
         (city_code, period, new_home_index_mom, new_home_index_yoy, second_hand_index_mom, second_hand_index_yoy, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(city_code, period) DO UPDATE SET
         new_home_index_mom = excluded.new_home_index_mom,
         new_home_index_yoy = excluded.new_home_index_yoy,
         second_hand_index_mom = excluded.second_hand_index_mom,
         second_hand_index_yoy = excluded.second_hand_index_yoy,
         fetched_at = excluded.fetched_at`
    )
    for (const record of records) {
      insert.run(
        cityCode,
        record.reportDate,
        record.newHomeMoM ?? null,
        record.newHomeYoY ?? null,
        record.secondHandMoM ?? null,
        record.secondHandYoY ?? null,
        now
      )
    }
  }
}

/** 用户手动录入的房价/租金数据仓储（本地 SQLite） */
export class UserHousingDataRepository {
  findByCity(cityCode: string): UserHousingData | undefined {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT id, city_code, district, community, price_total_yuan, rent_total_month_yuan, note, updated_at
         FROM user_housing_data WHERE city_code = ? ORDER BY updated_at DESC LIMIT 1`
      )
      .get(cityCode) as Record<string, string | number | null> | undefined
    if (!row) return undefined
    return {
      cityCode: String(row.city_code),
      district: row.district ? String(row.district) : undefined,
      community: row.community ? String(row.community) : undefined,
      priceTotalYuan: row.price_total_yuan != null ? Number(row.price_total_yuan) : undefined,
      rentTotalMonthYuan: row.rent_total_month_yuan != null ? Number(row.rent_total_month_yuan) : undefined,
      note: row.note ? String(row.note) : undefined,
      updatedAt: String(row.updated_at)
    }
  }

  upsert(input: Omit<UserHousingData, 'updatedAt'>): UserHousingData {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO user_housing_data (id, city_code, district, community, price_total_yuan, rent_total_month_yuan, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         district = excluded.district,
         community = excluded.community,
         price_total_yuan = excluded.price_total_yuan,
         rent_total_month_yuan = excluded.rent_total_month_yuan,
         note = excluded.note,
         updated_at = excluded.updated_at`
    ).run(
      input.cityCode,
      input.cityCode,
      input.district ?? null,
      input.community ?? null,
      input.priceTotalYuan ?? null,
      input.rentTotalMonthYuan ?? null,
      input.note ?? null,
      now
    )

    return { ...input, cityCode: input.cityCode, updatedAt: now }
  }

  remove(cityCode: string): void {
    const db = getDatabase()
    db.prepare('DELETE FROM user_housing_data WHERE city_code = ?').run(cityCode)
  }
}

/** 城市关注列表仓储（本地 SQLite） */
export class HousingWatchlistRepository {
  list(): HousingWatchCityRecord[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT city_code, city_name, added_at FROM housing_watchlist ORDER BY added_at DESC')
      .all() as Array<{ city_code: string; city_name: string; added_at: string }>
    return rows.map((row) => ({
      cityCode: row.city_code,
      cityName: row.city_name,
      addedAt: row.added_at
    }))
  }

  add(cityCode: string, cityName: string): void {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO housing_watchlist (city_code, city_name, added_at)
       VALUES (?, ?, ?)
       ON CONFLICT(city_code) DO UPDATE SET city_name = excluded.city_name`
    ).run(cityCode, cityName, new Date().toISOString())
  }

  remove(cityCode: string): void {
    const db = getDatabase()
    db.prepare('DELETE FROM housing_watchlist WHERE city_code = ?').run(cityCode)
  }

  has(cityCode: string): boolean {
    const db = getDatabase()
    const row = db.prepare('SELECT 1 FROM housing_watchlist WHERE city_code = ?').get(cityCode)
    return row != null
  }
}
