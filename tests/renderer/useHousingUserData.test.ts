import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHousingUserData } from '@renderer/hooks/useHousing'
import { housingApi } from '@renderer/services/housingApi'

vi.mock('@renderer/services/housingApi', () => ({
  housingApi: { updateUserData: vi.fn(), removeUserData: vi.fn() }
}))

function renderActions(onSaved?: () => void | Promise<void>) {
  let actions!: ReturnType<typeof useHousingUserData>
  function Probe() {
    actions = useHousingUserData(onSaved)
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return actions
}

afterEach(() => vi.resetAllMocks())

describe('房产自定义数据操作结果', () => {
  it('保存失败会拒绝调用者，阻止页面误报成功', async () => {
    vi.mocked(housingApi.updateUserData).mockRejectedValueOnce(new Error('SQLite 写入失败'))
    const actions = renderActions()
    await expect(actions.save({ city: '北京', priceTotalYuan: 5000000 })).rejects.toThrow('SQLite 写入失败')
  })

  it('清除失败会拒绝调用者，保留页面尚未删除的数据', async () => {
    vi.mocked(housingApi.removeUserData).mockRejectedValueOnce(new Error('SQLite 删除失败'))
    const actions = renderActions()
    await expect(actions.remove('北京')).rejects.toThrow('SQLite 删除失败')
  })

  it('保存结果等待刷新完成，避免保存完成时仍显示旧收益率', async () => {
    vi.mocked(housingApi.updateUserData).mockResolvedValueOnce(undefined)
    let finishRefresh!: () => void
    const refresh = new Promise<void>((resolve) => { finishRefresh = resolve })
    const actions = renderActions(() => refresh)
    let finished = false
    const saving = actions.save({ city: '北京', priceTotalYuan: 5000000 }).then(() => { finished = true })
    await Promise.resolve()
    await Promise.resolve()
    expect(finished).toBe(false)
    finishRefresh()
    await saving
    expect(finished).toBe(true)
  })

  it('SQLite已保存后刷新失败时返回单独警告，不把持久化结果当作失败', async () => {
    vi.mocked(housingApi.updateUserData).mockResolvedValueOnce(undefined)
    const actions = renderActions(async () => { throw new Error('市场数据不可用') })
    await expect(actions.save({ city: '北京', priceTotalYuan: 5000000 })).resolves.toEqual({
      refreshError: '市场数据不可用'
    })
  })

  it('SQLite已清除后刷新失败时仍返回清除成功与刷新警告', async () => {
    vi.mocked(housingApi.removeUserData).mockResolvedValueOnce(undefined)
    const actions = renderActions(async () => { throw new Error('刷新读取失败') })
    await expect(actions.remove('北京')).resolves.toEqual({ refreshError: '刷新读取失败' })
  })
})
