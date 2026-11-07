import { afterEach, describe, expect, it, vi } from 'vitest'
import { maskAmount, readHideAmountsPreference, writeHideAmountsPreference } from '@renderer/utils/amountPrivacy'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubStorage(initial?: string) {
  const store = new Map<string, string>()
  if (initial !== undefined) store.set('dm:hide-amounts', initial)
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value)
    }
  })
  return store
}

describe('maskAmount', () => {
  it('遮蔽所有数字并保留货币符号与分隔符', () => {
    expect(maskAmount('¥243,180.20')).toBe('¥∗∗∗,∗∗∗.∗∗')
  })

  it('遮蔽百分比中的数字', () => {
    expect(maskAmount('+12.40%')).toBe('+∗∗.∗∗%')
  })

  it('原样保留无数字的占位文案', () => {
    expect(maskAmount('--')).toBe('--')
  })
})

describe('金额隐藏偏好', () => {
  it('未设置时默认不隐藏', () => {
    stubStorage()
    expect(readHideAmountsPreference()).toBe(false)
  })

  it('读取已保存的开启状态', () => {
    stubStorage('1')
    expect(readHideAmountsPreference()).toBe(true)
  })

  it('写入后可读回，关闭时亦然', () => {
    const store = stubStorage()
    writeHideAmountsPreference(true)
    expect(store.get('dm:hide-amounts')).toBe('1')
    expect(readHideAmountsPreference()).toBe(true)
    writeHideAmountsPreference(false)
    expect(readHideAmountsPreference()).toBe(false)
  })

  it('无 window 环境下读写安全降级', () => {
    expect(readHideAmountsPreference()).toBe(false)
    expect(() => writeHideAmountsPreference(true)).not.toThrow()
  })
})