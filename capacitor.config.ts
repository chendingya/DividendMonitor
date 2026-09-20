import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.chendingya.dividendmonitor',
  appName: '收息佬',
  webDir: 'mobile/www',
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'auto' },
  plugins: {
    CapacitorSQLite: { androidIsEncryption: false, androidBiometric: { biometricAuth: false } }
  }
}

export default config
