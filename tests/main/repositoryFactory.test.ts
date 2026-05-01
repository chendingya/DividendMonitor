import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('repositoryFactory', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return local WatchlistRepository for offline mode', async () => {
    // Mock runtime mode to return 'offline'
    vi.doMock('@main/infrastructure/supabase/runtimeMode', () => ({
      getRuntimeMode: () => 'offline' as const,
      setRuntimeMode: () => {}
    }))

    const { getWatchlistRepository } = await import('@main/repositories/repositoryFactory')
    const { WatchlistRepository } = await import('@main/repositories/watchlistRepository')

    const repo = getWatchlistRepository()
    expect(repo).toBeInstanceOf(WatchlistRepository)
  })

  it('should return SupabaseWatchlistRepository for online mode', async () => {
    vi.doMock('@main/infrastructure/supabase/runtimeMode', () => ({
      getRuntimeMode: () => 'online' as const,
      setRuntimeMode: () => {}
    }))

    const { getWatchlistRepository } = await import('@main/repositories/repositoryFactory')
    const { SupabaseWatchlistRepository } = await import('@main/repositories/supabaseWatchlistRepository')

    const repo = getWatchlistRepository()
    expect(repo).toBeInstanceOf(SupabaseWatchlistRepository)
  })

  it('should return local PortfolioRepository for offline mode', async () => {
    vi.doMock('@main/infrastructure/supabase/runtimeMode', () => ({
      getRuntimeMode: () => 'offline' as const,
      setRuntimeMode: () => {}
    }))

    const { getPortfolioRepository } = await import('@main/repositories/repositoryFactory')
    const { PortfolioRepository } = await import('@main/repositories/portfolioRepository')

    const repo = getPortfolioRepository()
    expect(repo).toBeInstanceOf(PortfolioRepository)
  })

  it('should return SupabasePortfolioRepository for online mode', async () => {
    vi.doMock('@main/infrastructure/supabase/runtimeMode', () => ({
      getRuntimeMode: () => 'online' as const,
      setRuntimeMode: () => {}
    }))

    const { getPortfolioRepository } = await import('@main/repositories/repositoryFactory')
    const { SupabasePortfolioRepository } = await import('@main/repositories/supabasePortfolioRepository')

    const repo = getPortfolioRepository()
    expect(repo).toBeInstanceOf(SupabasePortfolioRepository)
  })

  it('should cache instances and return the same object', async () => {
    vi.doMock('@main/infrastructure/supabase/runtimeMode', () => ({
      getRuntimeMode: () => 'offline' as const,
      setRuntimeMode: () => {}
    }))

    const { getWatchlistRepository } = await import('@main/repositories/repositoryFactory')

    const first = getWatchlistRepository()
    const second = getWatchlistRepository()
    expect(first).toBe(second)
  })

  describe('getPriceCacheRepository', () => {
    it('should return SqlitePriceCacheRepository for offline mode', async () => {
      vi.doMock('@main/infrastructure/supabase/runtimeMode', () => ({
        getRuntimeMode: () => 'offline' as const,
        setRuntimeMode: () => {}
      }))

      const { getPriceCacheRepository } = await import(
        '@main/repositories/repositoryFactory'
      )
      const { SqlitePriceCacheRepository } = await import(
        '@main/repositories/priceCacheRepository'
      )

      const repo = getPriceCacheRepository()
      expect(repo).toBeInstanceOf(SqlitePriceCacheRepository)
    })

    it('should return SupabasePriceCacheRepository for online mode', async () => {
      vi.doMock('@main/infrastructure/supabase/runtimeMode', () => ({
        getRuntimeMode: () => 'online' as const,
        setRuntimeMode: () => {}
      }))

      const { getPriceCacheRepository } = await import(
        '@main/repositories/repositoryFactory'
      )
      const { SupabasePriceCacheRepository } = await import(
        '@main/repositories/supabasePriceCacheRepository'
      )

      const repo = getPriceCacheRepository()
      expect(repo).toBeInstanceOf(SupabasePriceCacheRepository)
    })
  })
})
