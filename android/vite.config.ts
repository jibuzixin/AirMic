import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

function localTimestamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // 构建时间：显示在「预案 → 外观」下面，方便确认装的是哪一版
    // 用本地时间，别用 UTC（否则和用户看到的时钟对不上）
    __BUILD_TIME__: JSON.stringify(localTimestamp()),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Capacitor 用 file:// 加载，资源路径必须是相对路径
    outDir: 'dist',
  },
})
