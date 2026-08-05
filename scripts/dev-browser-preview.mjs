import { spawn } from 'node:child_process'
import net from 'node:net'

const HOST = '127.0.0.1'
const RENDERER_BASE_PORT = 8192
const API_BASE_PORT = 3210

/** 探测指定端口是否空闲（connect 成功即被占用） */
function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(true))
  })
}

/** 从 start 起递增找到第一个空闲端口 */
async function findFreePort(start) {
  let port = start
  while (!(await isPortFree(port))) {
    port += 1
  }
  return port
}

const rendererPort = await findFreePort(RENDERER_BASE_PORT)
const apiPort = await findFreePort(API_BASE_PORT)

console.log(`[dev-browser-preview] renderer: http://${HOST}:${rendererPort}  api: http://${HOST}:${apiPort}`)

const child = spawn('npx electron-vite dev', {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DIVIDEND_MONITOR_HEADLESS: '1',
    PREVIEW_PORT: String(rendererPort),
    LOCAL_HTTP_API_PORT: String(apiPort)
  }
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
