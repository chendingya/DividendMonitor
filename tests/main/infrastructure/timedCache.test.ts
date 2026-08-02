import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimedCache } from '@main/infrastructure/cache/timedCache'

describe('TimedCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns undefined when key is missing', () => {
    const cache = new TimedCache<string, number>(1000)
    expect(cache.getFresh('a')).toBeUndefined()
  })

  it('returns fresh value wrapped in object', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 42)
    expect(cache.getFresh('a')).toEqual({ value: 42 })
  })

  it('expires after ttl elapses', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 42)
    vi.advanceTimersByTime(1001)
    expect(cache.getFresh('a')).toBeUndefined()
  })

  it('does not expire exactly at ttl boundary', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 42)
    vi.advanceTimersByTime(1000)
    expect(cache.getFresh('a')).toEqual({ value: 42 })
  })

  it('can cache undefined values', () => {
    const cache = new TimedCache<string, number | undefined>(1000)
    cache.set('a', undefined)
    expect(cache.getFresh('a')).toEqual({ value: undefined })
  })

  it('set overwrites existing entry', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 1)
    cache.set('a', 2)
    expect(cache.getFresh('a')).toEqual({ value: 2 })
    expect(cache.size).toBe(1)
  })

  it('delete removes entry', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 1)
    cache.delete('a')
    expect(cache.getFresh('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('clear empties cache', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.getFresh('a')).toBeUndefined()
  })
})
