import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.airmic.phone',
  appName: 'AirMic',
  webDir: 'dist',
  android: {
    // 麦克风要能后台跑：前台服务 + 麦克风权限
    allowMixedContent: false,
    backgroundColor: '#0B0B0D',
    // 页面铺满全屏（画到状态栏下面），内边距由前端用原生返回的 insets 处理。
    // 这样状态栏区域的颜色永远跟主题一致 —— 不会像加边距那样露出一条窗口底色。
    adjustMarginsForEdgeToEdge: 'disable',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0B0B0D',
      showSpinner: false,
    },
  },
}

export default config
