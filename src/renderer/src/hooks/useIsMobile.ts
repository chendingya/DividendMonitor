import { useEffect, useState } from 'react'

/** 与 theme.css 中 @media (max-width: 900px) 的侧边栏隐藏断点保持一致（含边界） */
export const MOBILE_BREAKPOINT_PX = 900

export function resolveIsMobile(width: number, breakpointPx: number = MOBILE_BREAKPOINT_PX): boolean {
  return width <= breakpointPx
}

export function useIsMobile(breakpointPx: number = MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : resolveIsMobile(window.innerWidth, breakpointPx)
  )

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`)
    const sync = () => setIsMobile(resolveIsMobile(window.innerWidth, breakpointPx))
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [breakpointPx])

  return isMobile
}
