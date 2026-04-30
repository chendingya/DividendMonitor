import { ipcMain } from 'electron'
import { authService } from '@main/infrastructure/supabase/authService'
import { checkAuthRateLimit, recordAuthFailure, resetAuthRateLimit } from '@main/infrastructure/supabase/authRateLimiter'

/**
 * Wrap IPC handler result to avoid structured-clone garbling of Chinese
 * characters in Error messages (Windows GBK encoding issue).
 * Returns `{ __ipcError: string }` on error instead of throwing.
 */
function ipcOk<T>(data: T) {
  return data
}

function ipcError(err: unknown): { __ipcError: string } {
  const message = err instanceof Error ? err.message : String(err)
  return { __ipcError: message }
}

export function registerAuthChannels(): void {
  ipcMain.handle('auth:login', async (_event, request: { email: string; password: string }) => {
    checkAuthRateLimit(request.email)
    try {
      const result = await authService.login(request.email, request.password)
      resetAuthRateLimit(request.email)
      return ipcOk(result)
    } catch (err) {
      recordAuthFailure(request.email)
      return ipcError(err)
    }
  })

  ipcMain.handle('auth:register', async (_event, request: { email: string; password: string }) => {
    checkAuthRateLimit(request.email)
    try {
      const result = await authService.register(request.email, request.password)
      resetAuthRateLimit(request.email)
      return ipcOk(result)
    } catch (err) {
      recordAuthFailure(request.email)
      return ipcError(err)
    }
  })

  ipcMain.handle('auth:logout', async () => {
    return authService.logout()
  })

  ipcMain.handle('auth:getSession', async () => {
    return authService.getSession()
  })

  ipcMain.handle('auth:update-password', async (_event, request: { newPassword: string }) => {
    try {
      await authService.updatePassword(request.newPassword)
      return ipcOk(undefined)
    } catch (err) {
      return ipcError(err)
    }
  })
}
