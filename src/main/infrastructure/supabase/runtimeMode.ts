export type AppRuntimeMode = 'offline' | 'online'

let currentMode: AppRuntimeMode = 'offline'

export function getRuntimeMode(): AppRuntimeMode {
  return currentMode
}

export function setRuntimeMode(mode: AppRuntimeMode): void {
  currentMode = mode
}
