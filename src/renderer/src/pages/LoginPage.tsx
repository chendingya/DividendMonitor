import { Button, Input, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@renderer/contexts/AuthContext'
import { AppCard } from '@renderer/components/app/AppCard'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, register, skipLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isRegister, setIsRegister] = useState(false)

  async function handleSubmit() {
    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      setErrorMsg('请输入邮箱和密码')
      return
    }

    if (trimmedPassword.length < 6) {
      setErrorMsg('密码至少需要 6 位')
      return
    }

    if (isRegister && trimmedPassword !== confirmPassword.trim()) {
      setErrorMsg('两次输入的密码不一致')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      if (isRegister) {
        const message = await register(trimmedEmail, trimmedPassword)
        if (message) {
          setSuccessMsg(message)
          setIsRegister(false)
        } else {
          navigate('/')
        }
      } else {
        await login(trimmedEmail, trimmedPassword)
        navigate('/')
      }
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setConfirmPassword('')
      setErrorMsg(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSkip() {
    skipLogin()
    navigate('/')
  }

  return (
    <div className="ledger-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: 400, maxWidth: '90vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: '#0052d0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: '#fff', fontSize: 28, fontWeight: 700
          }}>
            息
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>收息佬</h1>
          <p style={{ color: '#66707a', fontSize: 13, margin: '6px 0 0' }}>
            {isRegister ? '创建账号，开启多端同步' : '登录账号以使用云端数据同步'}
          </p>
        </div>

        <AppCard>
          {errorMsg ? (
            <div style={{
              background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 8,
              padding: '8px 14px', marginBottom: 16, color: '#cf1322', fontSize: 13
            }}>
              {errorMsg}
            </div>
          ) : null}
          {successMsg ? (
            <div style={{
              background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8,
              padding: '8px 14px', marginBottom: 16, color: '#389e0d', fontSize: 13
            }}>
              {successMsg}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Typography.Text strong style={{ fontSize: 13 }}>邮箱</Typography.Text>
              <Input
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onPressEnter={handleSubmit}
                disabled={submitting}
                size="large"
                style={{ marginTop: 4 }}
              />
            </div>

            <div>
              <Typography.Text strong style={{ fontSize: 13 }}>密码</Typography.Text>
              <Input.Password
                placeholder={isRegister ? '至少 6 位密码' : '输入密码'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onPressEnter={handleSubmit}
                disabled={submitting}
                size="large"
                style={{ marginTop: 4 }}
              />
            </div>

            {isRegister && (
              <div>
                <Typography.Text strong style={{ fontSize: 13 }}>确认密码</Typography.Text>
                <Input.Password
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onPressEnter={handleSubmit}
                  disabled={submitting}
                  size="large"
                  status={confirmPassword && confirmPassword !== password ? 'error' : undefined}
                  style={{ marginTop: 4 }}
                />
                {confirmPassword && confirmPassword !== password && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>两次输入的密码不一致</Typography.Text>
                )}
              </div>
            )}

            <Button
              type="primary"
              size="large"
              block
              loading={submitting}
              onClick={handleSubmit}
              style={{ height: 42, borderRadius: 10 }}
            >
              {isRegister ? '注册新账号' : '登录'}
            </Button>

            <Button
              type="link"
              block
              onClick={() => { setIsRegister(!isRegister); setErrorMsg(null) }}
              style={{ color: '#66707a' }}
            >
              {isRegister ? '已有账号？返回登录' : '没有账号？注册'}
            </Button>
          </div>
        </AppCard>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 12 }}>—— 或 ——</div>
          <Button
            type="default"
            block
            onClick={handleSkip}
            style={{
              height: 42, borderRadius: 10, color: '#66707a',
              borderColor: '#d9dde1', background: '#f5f7f9'
            }}
          >
            跳过，离线使用
          </Button>
          <p style={{ color: '#8b949e', fontSize: 11, marginTop: 12 }}>
            使用在线模式可以多设备同步数据。离线模式数据仅存储在当前设备。
          </p>
        </div>
      </div>
    </div>
  )
}
