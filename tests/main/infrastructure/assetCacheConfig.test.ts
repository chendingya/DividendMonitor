import { describe, expect, it, vi } from 'vitest'
import {
  ASSET_CACHE_TTL_MS,
  getAssetTtlMs,
  isSnapshotFresh,
  FIXED_POOL_ASSET_KEYS
} from '@main/infrastructure/config/assetCacheConfig'

describe('assetCacheConfig', () => {
  describe('ASSET_CACHE_TTL_MS', () => {
    it('sets 15-minute TTL for STOCK', () => {
      expect(ASSET_CACHE_TTL_MS.STOCK).toBe(15 * 60 * 1000)
    })

    it('sets 15-minute TTL for ETF', () => {
      expect(ASSET_CACHE_TTL_MS.ETF).toBe(15 * 60 * 1000)
    })

    it('sets 24-hour TTL for FUND', () => {
      expect(ASSET_CACHE_TTL_MS.FUND).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe('getAssetTtlMs', () => {
    it('returns 15 min for STOCK', () => {
      expect(getAssetTtlMs('STOCK')).toBe(15 * 60 * 1000)
    })

    it('returns 24 hours for FUND', () => {
      expect(getAssetTtlMs('FUND')).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe('isSnapshotFresh', () => {
    it('returns true for a timestamp within TTL', () => {
      const now = new Date().toISOString()
      expect(isSnapshotFresh(now, 'STOCK')).toBe(true)
    })

    it('returns false for a timestamp older than TTL', () => {
      const old = new Date(Date.now() - 20 * 60 * 1000).toISOString()
      expect(isSnapshotFresh(old, 'STOCK')).toBe(false)
    })

    it('returns true for FUND timestamp within 12 hours', () => {
      const recent = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      expect(isSnapshotFresh(recent, 'FUND')).toBe(true)
    })

    it('returns false for FUND timestamp older than 25 hours', () => {
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      expect(isSnapshotFresh(old, 'FUND')).toBe(false)
    })
  })

  describe('FIXED_POOL_ASSET_KEYS', () => {
    it('contains at least 10 assets', () => {
      expect(FIXED_POOL_ASSET_KEYS.length).toBeGreaterThanOrEqual(10)
    })

    it('contains only valid asset key formats', () => {
      for (const key of FIXED_POOL_ASSET_KEYS) {
        expect(key).toMatch(/^(STOCK|ETF|FUND):A_SHARE:\d{6}$/)
      }
    })

    it('contains no duplicate keys', () => {
      expect(new Set(FIXED_POOL_ASSET_KEYS).size).toBe(FIXED_POOL_ASSET_KEYS.length)
    })
  })
})
