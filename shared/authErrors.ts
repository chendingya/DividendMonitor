/**
 * 登录相关错误的统一编码与解释。
 *
 * 跨进程（主进程 → IPC → 渲染进程）传递时只保留 Error.message，
 * 因此用 `[AUTH:CODE] 原始信息` 的形式携带错误类别，
 * 渲染层据此展示「原因 + 处理建议 + 技术详情」。
 */

export const AUTH_ERROR_CODES = [
  'NOT_CONFIGURED',
  'NETWORK',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_CONFIRMED',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'EMAIL_REGISTERED',
  'WEAK_PASSWORD',
  'INVALID_EMAIL',
  'UNKNOWN'
] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

export type AuthErrorInfo = {
  code: AuthErrorCode
  title: string
  hint: string
  detail?: string
}

const CATALOG: Record<AuthErrorCode, { title: string; hint: string }> = {
  NOT_CONFIGURED: {
    title: '未配置在线服务',
    hint: '当前安装缺少 Supabase 地址或密钥，无法连接登录服务。需要在 .env 中填写 SUPABASE_URL 与 SUPABASE_ANON_KEY 后重新构建应用。'
  },
  NETWORK: {
    title: '无法连接登录服务',
    hint: '请求没有到达 Supabase。请检查网络是否可用；如果使用代理，需要开启系统代理，应用会跟随系统代理访问，未开启时该服务通常无法直连。'
  },
  INVALID_CREDENTIALS: {
    title: '邮箱或密码错误',
    hint: '请确认邮箱拼写、大小写与输入法状态。忘记密码时可在 Supabase 后台重置后重试。'
  },
  EMAIL_NOT_CONFIRMED: {
    title: '邮箱尚未验证',
    hint: '请到注册邮箱点击确认链接后再登录。没有收到邮件时，可先检查垃圾邮件，再重新注册触发发送。'
  },
  RATE_LIMITED: {
    title: '尝试次数过多',
    hint: '短时间内失败次数过多，Supabase 已临时限制该邮箱的登录请求。请等待约 1 分钟后再试。'
  },
  SERVICE_UNAVAILABLE: {
    title: '登录服务暂时不可用',
    hint: 'Supabase 返回了服务端异常，常见原因是免费项目长时间闲置被暂停，或服务正在维护。请先确认 Supabase 项目状态，恢复后再登录。'
  },
  EMAIL_REGISTERED: {
    title: '该邮箱已注册',
    hint: '这个邮箱已经存在于账号系统中，请直接登录。忘记密码时可在 Supabase 后台重置。'
  },
  WEAK_PASSWORD: {
    title: '密码强度不足',
    hint: '请使用至少 6 位、包含字母与数字的密码。'
  },
  INVALID_EMAIL: {
    title: '邮箱格式不正确',
    hint: '请检查邮箱地址是否完整，例如 name@example.com。'
  },
  UNKNOWN: {
    title: '登录未成功',
    hint: '请稍后重试。若持续失败，可展开下方技术详情，其中的原始信息可用于进一步排查。'
  }
}

const PREFIX = '[AUTH:'
const PATTERN = /^\[AUTH:([A-Z_]+)\]\s?/

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value)
}

/** 生成带错误类别的 message，主进程抛出时使用。 */
export function encodeAuthError(code: AuthErrorCode, detail?: string): string {
  const suffix = detail?.trim() ? ` ${detail.trim()}` : ''
  return `${PREFIX}${code}]${suffix}`
}

/** 解析 message；无前缀的旧文案回退为 UNKNOWN，并保留原文作为详情。 */
export function decodeAuthError(raw: string | null | undefined): AuthErrorInfo {
  const text = (raw ?? '').trim()
  const match = PATTERN.exec(text)
  if (!match || !isAuthErrorCode(match[1])) {
    return {
      code: 'UNKNOWN',
      ...CATALOG.UNKNOWN,
      detail: text || undefined
    }
  }
  const code = match[1]
  const detail = text.slice(match[0].length).trim()
  return {
    code,
    ...CATALOG[code],
    detail: detail || undefined
  }
}

/** 单行展示：用于空间有限的位置（如账号中心的提示条）。 */
export function describeAuthError(raw: string | null | undefined): string {
  const info = decodeAuthError(raw)
  return info.hint ? `${info.title}：${info.hint}` : info.title
}
