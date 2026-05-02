import { useState, useEffect } from 'react'
import { message, Skeleton, Alert } from 'antd'
import { useSettings } from '@renderer/hooks/useSettings'
import type { SettingsDto } from '@shared/contracts/api'

const SORT_METRIC_OPTIONS = [
  { value: 'estimatedFutureYield', label: '估算未来股息率' },
  { value: 'averageYield', label: '平均股息率' },
  { value: 'peRatio', label: 'PE' },
  { value: 'roe', label: 'ROE' }
]

function SettingsPage() {
  const { settings, loading, error, saving, save, reset } = useSettings()
  const [local, setLocal] = useState<SettingsDto | null>(null)
  const [dirty, setDirty] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'backtest'>('general')

  useEffect(() => {
    if (settings && !local) {
      setLocal(settings)
    }
  }, [settings])

  function merge<K extends keyof SettingsDto>(key: K, value: SettingsDto[K]) {
    if (!local) return
    setLocal({ ...local, [key]: value })
    setDirty(true)
  }

  async function handleSave() {
    if (!local) return
    try {
      await save(local)
      setDirty(false)
      void message.success('设置已保存')
    } catch {
      void message.error('保存失败')
    }
  }

  async function handleReset() {
    try {
      const resetSettingsValue = await reset()
      setLocal(resetSettingsValue)
      setDirty(false)
      void message.success('已恢复默认设置')
    } catch {
      void message.error('恢复失败')
    }
  }

  if (loading) {
    return (
      <div className="ledger-page">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="ledger-page">
        <Alert message="加载设置失败" description={error} type="error" showIcon />
      </div>
    )
  }

  if (!local) {
    return (
      <div className="ledger-page">
        <div className="page-state-block">
          <p className="page-state-title">无法加载设置</p>
          <p className="page-state-description">请稍后重试。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ledger-page">
      <section className="ledger-watchlist-header">
        <div className="ledger-watchlist-copy">
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>设置</h1>
          <p className="ledger-hero-subtitle">自定义默认参数，应用于各页面的初始行为和回测计算。</p>
        </div>
      </section>

      <div className="ledger-toolbar-card">
        <div className="ledger-segmented-control">
          <button
            type="button"
            className={`ledger-filter-chip ${activeTab === 'general' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            通用
          </button>
          <button
            type="button"
            className={`ledger-filter-chip ${activeTab === 'backtest' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('backtest')}
          >
            回测
          </button>
        </div>

        {activeTab === 'general' && (
          <div className="ledger-section" style={{ gap: 22 }}>
            <div>
              <label className="ledger-stat-label" style={{ display: 'block', marginBottom: 8 }}>默认年份范围</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={local.defaultYearRange[0]}
                  onChange={(e) => merge('defaultYearRange', [parseInt(e.target.value, 10), local.defaultYearRange[1]])}
                  style={{
                    height: 40, padding: '0 14px', borderRadius: 999,
                    border: '1px solid rgba(211,217,224,0.92)',
                    background: 'rgba(243,245,247,0.92)', fontWeight: 600, fontSize: 13
                  }}
                >
                  {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span style={{ color: '#66707a', fontSize: 13, fontWeight: 600 }}>—</span>
                <select
                  value={local.defaultYearRange[1]}
                  onChange={(e) => merge('defaultYearRange', [local.defaultYearRange[0], parseInt(e.target.value, 10)])}
                  style={{
                    height: 40, padding: '0 14px', borderRadius: 999,
                    border: '1px solid rgba(211,217,224,0.92)',
                    background: 'rgba(243,245,247,0.92)', fontWeight: 600, fontSize: 13
                  }}
                >
                  {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="ledger-stat-label" style={{ display: 'block', marginBottom: 8 }}>默认排序指标</label>
              <select
                value={local.defaultSortMetric}
                onChange={(e) => merge('defaultSortMetric', e.target.value)}
                style={{
                  height: 40, padding: '0 14px', borderRadius: 999,
                  border: '1px solid rgba(211,217,224,0.92)',
                  background: 'rgba(243,245,247,0.92)', fontWeight: 600, fontSize: 13
                }}
              >
                {SORT_METRIC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="ledger-stat-label" style={{ display: 'block', marginBottom: 8 }}>数据刷新策略</label>
              <div className="ledger-segmented-control">
                <button
                  type="button"
                  className={`ledger-filter-chip ${local.refreshStrategy === 'manual' ? 'is-active' : ''}`}
                  onClick={() => merge('refreshStrategy', 'manual')}
                >
                  手动刷新
                </button>
                <button
                  type="button"
                  className={`ledger-filter-chip ${local.refreshStrategy === 'onLaunch' ? 'is-active' : ''}`}
                  onClick={() => merge('refreshStrategy', 'onLaunch')}
                >
                  打开时自动
                </button>
                <button
                  type="button"
                  className={`ledger-filter-chip ${local.refreshStrategy === 'interval' ? 'is-active' : ''}`}
                  onClick={() => merge('refreshStrategy', 'interval')}
                >
                  定时刷新
                </button>
              </div>
              {local.refreshStrategy === 'interval' && (
                <div style={{ marginTop: 10 }}>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 100 }}
                    min={1} max={1440}
                    value={local.refreshIntervalMinutes}
                    onChange={(e) => merge('refreshIntervalMinutes', parseInt(e.target.value, 10) || 30)}
                  />
                  <span style={{ marginLeft: 8, color: '#66707a', fontSize: 13, fontWeight: 600 }}>分钟</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'backtest' && (
          <div className="ledger-section" style={{ gap: 22 }}>
            <div>
              <label className="ledger-stat-label" style={{ display: 'block', marginBottom: 8 }}>默认初始资金</label>
              <input
                type="number"
                className="ledger-date-input"
                style={{ width: 180 }}
                min={1000} max={999999999} step={10000}
                value={local.backtestInitialCapital}
                onChange={(e) => merge('backtestInitialCapital', parseInt(e.target.value, 10) || 100000)}
              />
              <span style={{ marginLeft: 8, color: '#66707a', fontSize: 13, fontWeight: 600 }}>元</span>
            </div>

            <div>
              <label className="ledger-stat-label" style={{ display: 'block', marginBottom: 8 }}>计入手续费</label>
              <button
                type="button"
                className={`ledger-inline-action-btn ${local.backtestIncludeFees ? 'is-selected' : ''}`}
                onClick={() => merge('backtestIncludeFees', !local.backtestIncludeFees)}
                style={{ height: 40, padding: '0 22px', fontSize: 14 }}
              >
                {local.backtestIncludeFees ? '已开启' : '已关闭'}
              </button>
            </div>

            {local.backtestIncludeFees && (
              <div className="ledger-calc-summary">
                <div className="ledger-calc-summary-item">
                  <span>佣金率（单边）</span>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 130, marginTop: 8 }}
                    min={0} max={0.01} step={0.0001}
                    value={local.backtestFeeRate}
                    onChange={(e) => merge('backtestFeeRate', parseFloat(e.target.value) || 0.0003)}
                  />
                </div>
                <div className="ledger-calc-summary-item">
                  <span>印花税率（卖出）</span>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 130, marginTop: 8 }}
                    min={0} max={0.01} step={0.0001}
                    value={local.backtestStampDutyRate}
                    onChange={(e) => merge('backtestStampDutyRate', parseFloat(e.target.value) || 0.0005)}
                  />
                </div>
                <div className="ledger-calc-summary-item">
                  <span>最低佣金</span>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 100, marginTop: 8 }}
                    min={0} max={100} step={1}
                    value={local.backtestMinCommission}
                    onChange={(e) => merge('backtestMinCommission', parseInt(e.target.value, 10) || 5)}
                  />
                  <span style={{ marginLeft: 6, color: '#66707a', fontSize: 12, fontWeight: 600 }}>元</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="ledger-toolbar-divider" />

        <div className="ledger-hero-actions">
          <button type="button" className="ledger-primary-button" disabled={!dirty || saving} onClick={() => void handleSave()}>
            保存设置
          </button>
          <button type="button" className="ledger-secondary-button" onClick={() => void handleReset()}>
            恢复默认
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
