import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNativeRuntime } from '@renderer/services/nativeRuntime'

/** Android 系统返回键遵循页面导航，在首页将 App 放到后台。 */
export function NativeAppLifecycle() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (!isNativeRuntime()) return
    let disposed = false
    const subscription = import('@capacitor/app').then(async ({ App }) => {
      if (disposed) return undefined
      return App.addListener('backButton', ({ canGoBack }) => {
        if (pathname === '/' || pathname === '/login') { void App.minimizeApp(); return }
        if (canGoBack) navigate(-1)
        else navigate('/', { replace: true })
      })
    })
    return () => { disposed = true; void subscription.then((handle) => handle?.remove()) }
  }, [pathname, navigate])
  return null
}
