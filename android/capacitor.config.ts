import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.airmic.phone',
  appName: 'AirMic',
  webDir: 'dist',
  android: {
    // 麦克风要能后台跑：前台服务 + 麦克风权限
    allowMixedContent: false,
    backgroundColor: '#0B0B0D',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0B0B0D',
      showSpinner: false,
    },
  },
}

export default config
