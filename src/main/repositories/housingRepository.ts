import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { UserHousingData } from '@main/domain/entities/Housing'

export type HousingWatchCityRecord = {
  cityCode: string
  cityName: string
  addedAt: string
}

/** 用户手动录入的房价/租金数据仓储（本地 SQLite） */
export class UserHousingDataRepository {
  findByCity(cityCode: string): UserHousingData | undefined {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT id, city_code, district, community, price_per_sqm, rent_per_sqm, note, updated_at
         FROM user_housing_data WHERE city_code = ? ORDER BY updated_at DESC LIMIT 1`
      )
      .get(cityCode) as Record<string, string | number | null> | undefined
    if (!row) return undefined
    return {
      cityCode: String(row.city_code),
      district: row.district ? String(row.district) : undefined,
      community: row.community ? String(row.community) : undefined,
      pricePerSqm: row.price_per_sqm != null ? Number(row.price_per_sqm) : undefined,
      rentPerSqm: row.rent_per_sqm != null ? Number(row.rent_per_sqm) : undefined,
      note: row.note ? String(row.note) : undefined,
      updatedAt: String(row.updated_at)
    }
  }

  upsert(input: Omit<UserHousingData, 'updatedAt'>): UserHousingData {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO user_housing_data (id, city_code, district, community, price_per_sqm, rent_per_sqm, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         district = excluded.district,
         community = excluded.community,
         price_per_sqm = excluded.price_per_sqm,
         rent_per_sqm = excluded.rent_per_sqm,
         note = excluded.note,
         updated_at = excluded.updated_at`
    ).run(
      input.cityCode,
      input.cityCode,
      input.district ?? null,
      input.community ?? null,
      input.pricePerSqm ?? null,
      input.rentPerSqm ?? null,
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
