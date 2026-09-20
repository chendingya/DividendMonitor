import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ inprocessLoads: 0 }))
vi.mock('@renderer/services/nativeRuntime', () => ({ isNativeRuntime: () => false, initializeNativeRuntime: async () => undefined }))
vi.mock('@renderer/services/inprocessRuntimeApi', () => {
  state.inprocessLoads += 1
  return { inprocessRuntimeApi: { stock: { search: () => 'inprocess' } } }
})
vi.mock('@renderer/services/browserHttpRuntimeApi', () => ({ browserHttpRuntimeApi: { stock: { search: () => 'http' } } }))
vi.mock('@renderer/services/browserRuntimeApi', () => ({ browserRuntimeApi: { stock: { search: () => 'mock' } } }))

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); state.inprocessLoads = 0 })

describe('运行时选择与隔离', () => {
  it('挂载前初始化后才能使用进程内 API，重复初始化复用同一结果', async () => {
    vi.stubGlobal('window', { location: { search: '?runtime=inprocess' } })
    const module = await import('@renderer/services/desktopApi')
    expect(() => module.getStockDesktopApi()).toThrow('尚未初始化')
    await Promise.all([module.initializeRuntime(), module.initializeRuntime()])
    expect(module.getStockDesktopApi().search('')).toBe('inprocess')
    expect(state.inprocessLoads).toBe(1)
  })
  it('桌面 bridge 优先，且不加载进程内后端', async () => {
    const stock = { search: () => 'desktop' }
    vi.stubGlobal('window', { dividendMonitor: { stock }, location: { search: '?runtime=inprocess' } })
    const module = await import('@renderer/services/desktopApi')
    expect(module.getStockDesktopApi()).toBe(stock)
    expect(state.inprocessLoads).toBe(0)
  })

  it('查询参数必须精确匹配，不能由其他参数或相似值误启用', async () => {
    vi.stubGlobal('window', { location: { search: '?return=runtime=inprocess&runtime=mocking' } })
    const module = await import('@renderer/services/desktopApi')
    expect(module.getStockDesktopApi().search('')).toBe('http')
    expect(state.inprocessLoads).toBe(0)
  })
})
