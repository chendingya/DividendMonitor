import { Capacitor } from '@capacitor/core'

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform()
}

export async function initializeNativeRuntime(): Promise<void> {
  const [{ installMobileNativeSqliteProvider }, { setHttpGetTransport }, { createNativeHttpTransport }] = await Promise.all([
    import('@main/infrastructure/db/mobileNativeSqliteProvider'),
    import('@main/infrastructure/http/httpClient'),
    import('@main/infrastructure/http/nativeHttpTransport')
  ])
  await installMobileNativeSqliteProvider()
  setHttpGetTransport(createNativeHttpTransport())
}
