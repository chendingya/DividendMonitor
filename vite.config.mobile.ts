import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'SUPABASE_')
  return {
    root: resolve('src/renderer'),
    base: './',
    plugins: [react(), {
      name: 'mobile-content-security-policy',
      transformIndexHtml: {
        order: 'post',
        handler: () => [{ tag: 'meta', attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co; object-src 'none'; base-uri 'self'; frame-src 'none'"
        }, injectTo: 'head-prepend' }]
      }
    }],
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || '')
    },
    resolve: { alias: {
      '@renderer': resolve('src/renderer/src'), '@shared': resolve('shared'), '@main': resolve('src/main')
    } },
    build: { outDir: resolve('mobile/www'), emptyOutDir: true }
  }
})
