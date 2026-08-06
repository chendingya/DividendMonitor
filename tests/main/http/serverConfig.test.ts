import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import { getLocalApiBaseUrl, startLocalHttpServer, stopLocalHttpServer } from '@main/http/server'

/**
 * LOCAL_HTTP_API_ORIGIN / LOCAL_HTTP_API_CORS_ORIGINS / LOCAL_HTTP_API_HOSTS
 * 环境变量配置化验证：允许公网部署时指定完整基址、放行前端 origin 与 Host 域名。
 */
describe('HTTP API 基址与白名单配置化', () => {
  let nonce = ''

  beforeAll(async () => {
    process.env.LOCAL_HTTP_API_ORIGIN = 'http://127.0.0.1:0'
    process.env.LOCAL_HTTP_API_CORS_ORIGINS = 'https://app.example.com'
    process.env.LOCAL_HTTP_API_HOSTS = 'myapp.example.com'
    await startLocalHttpServer()

    const res = await fetch(`${getLocalApiBaseUrl()}/api/security/nonce`, { method: 'GET' })
    const payload = (await res.json()) as { nonce?: string }
    nonce = payload.nonce ?? ''
  })

  afterAll(async () => {
    await stopLocalHttpServer()
    delete process.env.LOCAL_HTTP_API_ORIGIN
    delete process.env.LOCAL_HTTP_API_CORS_ORIGINS
    delete process.env.LOCAL_HTTP_API_HOSTS
  })

  it('LOCAL_HTTP_API_ORIGIN 完整覆盖默认 127.0.0.1:3210（端口 0 返回实际绑定端口）', () => {
    const baseUrl = getLocalApiBaseUrl()
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(baseUrl).not.toBe('http://127.0.0.1:3210')
  })

  it('LOCAL_HTTP_API_CORS_ORIGINS 配置的 origin 被放行', async () => {
    const res = await fetch(`${getLocalApiBaseUrl()}/api/sync/status`, {
      method: 'GET',
      headers: { 'X-Local-Nonce': nonce, Origin: 'https://app.example.com' }
    })
    expect(res.status).toBe(200)
  })

  it('未配置的 origin 仍被拒绝', async () => {
    const res = await fetch(`${getLocalApiBaseUrl()}/api/sync/status`, {
      method: 'GET',
      headers: { 'X-Local-Nonce': nonce, Origin: 'https://evil.example.com' }
    })
    expect(res.status).toBe(403)
  })

  it('LOCAL_HTTP_API_HOSTS 配置的 Host 域名被放行（DNS rebinding 白名单扩展）', async () => {
    const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: new URL(getLocalApiBaseUrl()).port,
          path: '/api/sync/status',
          method: 'GET',
          headers: {
            Host: 'myapp.example.com',
            Origin: 'https://app.example.com',
            'X-Local-Nonce': nonce
          }
        },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => resolve({ statusCode: res.statusCode, body }))
        }
      )
      req.on('error', reject)
      req.end()
    })
    expect(response.statusCode).toBe(200)
  })

  it('未配置的 Host 域名仍被拒绝', async () => {
    const response = await new Promise<{ statusCode: number | undefined }>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: new URL(getLocalApiBaseUrl()).port,
          path: '/api/sync/status',
          method: 'GET',
          headers: {
            Host: 'evil.example.com',
            'X-Local-Nonce': nonce
          }
        },
        (res) => {
          res.resume()
          res.on('end', () => resolve({ statusCode: res.statusCode }))
        }
      )
      req.on('error', reject)
      req.end()
    })
    expect(response.statusCode).toBe(403)
  })
})
