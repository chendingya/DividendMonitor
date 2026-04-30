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
      port: 8192,
      strictPort: true
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
