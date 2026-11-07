const HIDE_AMOUNTS_KEY = 'dm:hide-amounts'

export function maskAmount(text: string): string {
  return text.replace(/[0-9]/g, '∗')
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  return window.localStorage
}

export function readHideAmountsPreference(): boolean {
  return getStorage()?.getItem(HIDE_AMOUNTS_KEY) === '1'
}

export function writeHideAmountsPreference(hidden: boolean): void {
  getStorage()?.setItem(HIDE_AMOUNTS_KEY, hidden ? '1' : '0')
}