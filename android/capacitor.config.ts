import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.airmic.phone',
  appName: 'AirMic',
  webDir: 'dist',
  android: {
    // 麦克风要能后台跑：前台服务 + 麦克风权限
    allowMixedContent: false,
    backgroundColor: '#0B0B0D',
    // ⚠️ 必须给 WebView 加系统栏边距 ——
    // Android 15 起强制边缘到边缘，不加的话界面会顶到状态栏/导航栏下面
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0B0B0D',
      showSpinner: false,
    },
  },
}

export default config
