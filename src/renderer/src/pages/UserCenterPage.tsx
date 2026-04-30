import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@renderer/contexts/AuthContext'
import { getSyncDesktopApi } from '@renderer/services/desktopApi'
import { AppCard } from '@renderer/components/app/AppCard'

type SyncDirection = 'push' | 'pull' | 'bidirectional'

export function UserCenterPage() {
  const navigate = useNavigate()
  const { mode, session, logout, syncStatus } = useAuth()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  // Password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  async function handleSync(direction: SyncDirection) {
    setSyncing(true)
    setSyncResult(null)

    try {
      const syncApi = getSyncDesktopApi()
      const result = await syncApi.syncData(direction)
      const parts: string[] = []

      if (direction === 'push' || direction === 'bidirectional') {
        parts.push(`推送自选 ${result.watchlistPushed} 条`)
        parts.push(`推送持仓 ${result.portfolioPushed} 条`)
      }
      if (direction === 'pull' || direction === 'bidirectional') {
        parts.push(`拉取自选 ${result.watchlistPulled} 条`)
        parts.push(`拉取持仓 ${result.portfolioPulled} 条`)
      }

      if (result.errors.length > 0) {
        setSyncResult(`同步完成（${result.errors.length} 个错误）：${result.errors[0]}`)
      } else {
        setSyncResult(parts.join('，'))
      }
    } catch (err) {
      setSyncResult(`同步失败：${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handlePasswordChange() {
    const trimmed = newPassword.trim()
    const trimmedConfirm = confirmNewPassword.trim()

    if (!trimmed || !trimmedConfirm) {
      setPasswordMsg({ type: 'error', text: '请输入新密码和确认密码' })
      return
    }

    if (trimmed.length < 6) {
      setPasswordMsg({ type: 'error', text: '密码至少需要 6 位' })
      return
    }

    if (trimmed !== trimmedConfirm) {
      setPasswordMsg({ type: 'error', text: '两次输入的密码不一致' })
      return
    }

    setChangingPassword(true)
    setPasswordMsg(null)

    try {
      const api = window.dividendMonitor
      await api.auth.updatePassword(trimmed)
      setPasswordMsg({ type: 'success', text: '密码修改成功' })
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof Error ? err.message : '修改密码失败' })
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  // ============ Logged-out / Offline state ============
  if (!session || mode === 'offline') {
    return (
      <div className="ledger-page">
        <section className="ledger-metric-grid">
          <div className="ledger-metric-panel is-primary">
            <div className="ledger-metric-top">
              <div className="ledger-metric-icon">
                <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <span className="pill" style={{ background: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.8)' }}>离线模式</span>
            </div>
            <div className="ledger-metric-label">当前运行模式</div>
            <div className="ledger-metric-value">离线</div>
            <div className="ledger-metric-hint">数据仅存储在本机，无法多设备同步</div>
          </div>

          <div className="ledger-metric-panel">
            <div className="ledger-metric-top">
              <div className="ledger-metric-icon">
                <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
                  <path d="M12 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M16.5 7.5a4.5 4.5 0 0 0-9 0c0 2.5 2 3.3 4.5 4s4.5 1.5 4.5 4a4.5 4.5 0 0 1-9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <div className="ledger-metric-label">数据存储</div>
            <div className="ledger-metric-value">本机</div>
            <div className="ledger-metric-hint">换机或重装后数据将丢失</div>
          </div>

          <div className="ledger-metric-panel">
            <div className="ledger-metric-top">
              <div className="ledger-metric-icon">
                <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <div className="ledger-metric-label">同步能力</div>
            <div className="ledger-metric-value">--</div>
            <div className="ledger-metric-hint">登录后开启云同步</div>
          </div>
        </section>

        <AppCard title="开启在线模式">
          <p style={{ color: 'var(--text-soft)', fontSize: 14, lineHeight: 1.8, margin: '0 0 18px' }}>
            登录账号后，你的自选和持仓数据将自动同步到云端，支持多设备访问与备份恢复。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ledger-primary-button"
              onClick={() => navigate('/login')}
            >
              登录 / 注册
            </button>
            <button
              type="button"
              className="ledger-secondary-button"
              onClick={() => navigate('/')}
            >
              返回首页
            </button>
          </div>
        </AppCard>
      </div>
    )
  }

  // ============ Logged-in state ============
  const email = session.user.email ?? '未知用户'
  const initial = email[0].toUpperCase()
  const syncStatusLabel = syncStatus?.status === 'synced' ? '已同步'
    : syncStatus?.status === 'offline-fallback' ? '降级同步'
    : syncStatus?.status === 'error' ? '同步异常'
    : '正常'
  const syncStatusClass = syncStatus?.status === 'synced' ? 'success'
    : syncStatus?.status === 'error' ? 'danger'
    : 'primary'

  return (
    <div className="ledger-page">
      {/* Hero: User profile */}
      <section className="ledger-hero-card">
        <div className="ledger-hero-copy">
          <div>
            <div className="ledger-section-kicker">用户中心</div>
            <h1 className="ledger-hero-title">{email}</h1>
            <p className="ledger-hero-subtitle">
              <span className={`pill ${syncStatusClass}`} style={{ marginRight: 8 }}>
                {syncStatusLabel}
              </span>
              在线模式 · 云端数据同步已开启
            </p>
          </div>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: 'linear-gradient(135deg, #2866eb, #0052d0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 26, fontWeight: 800, flexShrink: 0,
            boxShadow: '0 12px 24px rgba(0,82,208,0.2)'
          }}>
            {initial}
          </div>
        </div>
      </section>

      {/* Metric cards */}
      <section className="ledger-metric-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="ledger-metric-panel is-primary">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="ledger-metric-label">运行模式</div>
          <div className="ledger-metric-value">在线</div>
          <div className="ledger-metric-hint">数据双写到云端与本机</div>
        </div>

        <div className="ledger-metric-panel">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
                <path d="M5.5 3.5h13a1.5 1.5 0 0 1 1.5 1.5v15l-8-3-8 3V5a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="ledger-metric-label">自选同步</div>
          <div className="ledger-metric-value" style={{ color: 'var(--primary)' }}>已启用</div>
          <div className="ledger-metric-hint">增删自动同步到云端</div>
        </div>

        <div className="ledger-metric-panel">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
                <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
          </div>
          <div className="ledger-metric-label">持仓同步</div>
          <div className="ledger-metric-value" style={{ color: 'var(--primary)' }}>已启用</div>
          <div className="ledger-metric-hint">增删改自动同步到云端</div>
        </div>
      </section>

      {/* Sync strategy section */}
      <AppCard title="数据同步策略">
        <div className="ledger-section" style={{ gap: 14 }}>
          <p style={{ color: 'var(--text-soft)', fontSize: 14, lineHeight: 1.8, margin: 0 }}>
            在线模式下，你的所有操作会自动双写到本地 SQLite 和云端 Supabase。
            如果你在不同设备上使用，或曾离线使用后需要补同步，可以手动执行同步操作。
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <button
              type="button"
              className="ledger-primary-button"
              disabled={syncing}
              onClick={() => handleSync('bidirectional')}
            >
              {syncing ? '同步中…' : '双向同步'}
            </button>
            <button
              type="button"
              className="ledger-secondary-button"
              disabled={syncing}
              onClick={() => handleSync('push')}
            >
              仅推送本地到云端
            </button>
            <button
              type="button"
              className="ledger-secondary-button"
              disabled={syncing}
              onClick={() => handleSync('pull')}
            >
              仅拉取云端到本地
            </button>
          </div>

          {syncResult && (
            <div style={{
              padding: '12px 16px', borderRadius: 14,
              background: syncResult.includes('失败') || syncResult.includes('错误')
                ? 'var(--danger-soft)' : 'var(--success-soft)',
              color: syncResult.includes('失败') || syncResult.includes('错误')
                ? '#b31b25' : '#1b7a47',
              fontSize: 13, fontWeight: 600
            }}>
              {syncResult}
            </div>
          )}

          <div className="ledger-toolbar-divider" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="ledger-calc-summary-item">
              <span>双向同步</span>
              <strong style={{ fontSize: 15 }}>推送 + 拉取</strong>
              <span style={{ fontSize: 11, lineHeight: 1.5 }}>将本地数据推到云端，同时拉取云端新数据到本地，适合日常使用</span>
            </div>
            <div className="ledger-calc-summary-item">
              <span>仅推送</span>
              <strong style={{ fontSize: 15 }}>本地 → 云端</strong>
              <span style={{ fontSize: 11, lineHeight: 1.5 }}>把本机的自选和持仓全部上传到云端，适合离线使用后补传</span>
            </div>
            <div className="ledger-calc-summary-item">
              <span>仅拉取</span>
              <strong style={{ fontSize: 15 }}>云端 → 本地</strong>
              <span style={{ fontSize: 11, lineHeight: 1.5 }}>用云端数据覆盖本机数据，适合换设备后恢复</span>
            </div>
          </div>
        </div>
      </AppCard>

      {/* Account actions */}
      <AppCard title="账号操作">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 0'
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>用户 ID</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4, fontFamily: 'monospace' }}>
                {session.user.id.slice(0, 8)}…
              </div>
            </div>
            <span className="pill primary">已认证</span>
          </div>

          <div className="ledger-toolbar-divider" />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 0'
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>修改密码</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>
                更新账号登录密码
              </div>
            </div>
            <button
              type="button"
              className="ledger-secondary-button"
              onClick={() => {
                setNewPassword('')
                setConfirmNewPassword('')
                setPasswordMsg(null)
                setShowPasswordForm(!showPasswordForm)
              }}
            >
              {showPasswordForm ? '取消' : '修改密码'}
            </button>
          </div>

          {showPasswordForm && (
            <div style={{ padding: '0 0 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-soft)' }}>新密码</label>
                  <input
                    type="password"
                    placeholder="至少 6 位新密码"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changingPassword}
                    style={{
                      width: '100%', height: 38, padding: '0 12px', fontSize: 14,
                      border: '1px solid var(--border)', borderRadius: 8,
                      background: 'var(--surface)', color: 'var(--text)',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-soft)' }}>确认新密码</label>
                  <input
                    type="password"
                    placeholder="再次输入新密码"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    disabled={changingPassword}
                    style={{
                      width: '100%', height: 38, padding: '0 12px', fontSize: 14,
                      border: '1px solid var(--border)', borderRadius: 8,
                      background: 'var(--surface)', color: 'var(--text)',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
                {passwordMsg && (
                  <div style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: passwordMsg.type === 'error' ? 'var(--danger-soft)' : 'var(--success-soft)',
                    color: passwordMsg.type === 'error' ? '#b31b25' : '#1b7a47'
                  }}>
                    {passwordMsg.text}
                  </div>
                )}
                <button
                  type="button"
                  className="ledger-primary-button"
                  disabled={changingPassword}
                  onClick={handlePasswordChange}
                >
                  {changingPassword ? '修改中…' : '确认修改'}
                </button>
              </div>
            </div>
          )}

          <div className="ledger-toolbar-divider" />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 0'
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>退出登录</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>
                切换到离线模式，本机数据保留
              </div>
            </div>
            <button
              type="button"
              className="ledger-secondary-button"
              style={{ color: '#b4232c', borderColor: 'rgba(255,77,79,0.3)' }}
              onClick={handleLogout}
            >
              退出登录
            </button>
          </div>
        </div>
      </AppCard>
    </div>
  )
}
