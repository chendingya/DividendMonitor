import { describe, expect, it } from 'vitest'
import { decodeAuthError, describeAuthError, encodeAuthError } from '@shared/authErrors'

describe('authErrors 编解码', () => {
  it('编码后解码得到同一类别、标题与详情', () => {
    const raw = encodeAuthError('NETWORK', 'fetch failed')
    expect(raw).toBe('[AUTH:NETWORK] fetch failed')

    const info = decodeAuthError(raw)
    expect(info.code).toBe('NETWORK')
    expect(info.title).toBe('无法连接登录服务')
    expect(info.hint).toContain('代理')
    expect(info.detail).toBe('fetch failed')
  })

  it('无详情时编码简洁且解码不含详情', () => {
    const info = decodeAuthError(encodeAuthError('NOT_CONFIGURED'))
    expect(info.code).toBe('NOT_CONFIGURED')
    expect(info.detail).toBeUndefined()
  })

  it('无前缀的旧文案回退为 UNKNOWN 并保留原文', () => {
    const info = decodeAuthError('登录失败：fetch failed')
    expect(info.code).toBe('UNKNOWN')
    expect(info.title).toBe('登录未成功')
    expect(info.detail).toBe('登录失败：fetch failed')
  })

  it('未知类别回退为 UNKNOWN，原文整体作为详情', () => {
    const info = decodeAuthError('[AUTH:NOT_A_CODE] 未知内容')
    expect(info.code).toBe('UNKNOWN')
    expect(info.detail).toBe('[AUTH:NOT_A_CODE] 未知内容')
  })

  it('空输入不产生详情', () => {
    expect(decodeAuthError(null).detail).toBeUndefined()
    expect(decodeAuthError('   ').detail).toBeUndefined()
  })

  it('每个类别的标题与建议均非空', () => {
    const codes = [
      'NOT_CONFIGURED',
      'NETWORK',
      'INVALID_CREDENTIALS',
      'EMAIL_NOT_CONFIRMED',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
      'EMAIL_REGISTERED',
      'WEAK_PASSWORD',
      'INVALID_EMAIL',
      'UNKNOWN'
    ] as const
    for (const code of codes) {
      const info = decodeAuthError(encodeAuthError(code))
      expect(info.title.length).toBeGreaterThan(0)
      expect(info.hint.length).toBeGreaterThan(10)
    }
  })

  it('单行描述包含标题与建议，且不暴露原始编码', () => {
    const text = describeAuthError(encodeAuthError('RATE_LIMITED', 'too many requests'))
    expect(text).toContain('尝试次数过多')
    expect(text).toContain('等待约 1 分钟')
    expect(text).not.toContain('[AUTH:')
    expect(text).not.toContain('too many requests')
  })

  it('单行描述对无前缀文案回退为通用说明', () => {
    expect(describeAuthError('未知错误')).toContain('登录未成功')
  })
})
