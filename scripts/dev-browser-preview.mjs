import { spawn } from 'node:child_process'

const child = spawn('npx electron-vite dev', {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DIVIDEND_MONITOR_HEADLESS: '1'
  }
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
