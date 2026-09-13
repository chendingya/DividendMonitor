import { describe, expect, it } from 'vitest'
import { MOBILE_BREAKPOINT_PX, resolveIsMobile } from '@renderer/hooks/useIsMobile'

describe('resolveIsMobile', () => {
  it('390px 手机宽度判定为移动端', () => {
    expect(resolveIsMobile(390)).toBe(true)
  })

  it('900px 判定为移动端，与 CSS @media (max-width: 900px) 边界一致', () => {
    expect(resolveIsMobile(900)).toBe(true)
  })

  it('901px 判定为桌面端', () => {
    expect(resolveIsMobile(901)).toBe(false)
  })

  it('支持自定义断点（含边界）', () => {
    expect(resolveIsMobile(721, 720)).toBe(false)
    expect(resolveIsMobile(720, 720)).toBe(true)
  })

  it('默认断点常量为 900，与 theme.css 侧边栏隐藏断点一致', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(900)
  })
})
