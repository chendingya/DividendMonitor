import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'SUPABASE_')

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || ''),
        'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || '')
      },
      resolve: {
        alias: {
          '@main': resolve('src/main'),
          '@shared': resolve('shared')
        }
      }
    },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          // sandbox: true 的渲染进程要求 preload 为 CJS（ESM preload 无法加载）
          format: 'cjs'
        }
      }
    },
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('shared')
      }
    }
  },
  renderer: {
    server: {
      host: '127.0.0.1',
      port: Number(process.env.PREVIEW_PORT) || 8192,
      strictPort: true,
      proxy: {
        // 同源代理到无头主进程 HTTP API（端口由 dev-browser-preview 脚本探测后传入）
        '/api': {
          target: `http://127.0.0.1:${process.env.LOCAL_HTTP_API_PORT || 3210}`,
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react()]
  }
  }
})
