import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Device } from './airmic-data'

/**
 * 手机端 ↔ 电脑端的通道
 * ------------------------------------------------------------
 * 真实实现走 Kotlin 原生插件（TCP 控制通道 + UDP 音频）：
 *   - 扫描：NsdManager（mDNS `_airmic._tcp`）
 *   - 控制：TCP + JSON Lines
 *   - 音频：AudioRecord → MediaCodec(Opus) → UDP
 *
 * Web 版（浏览器里跑 UI 时）没有原生通道，用一个**仅供开发**的
 * 本地模拟实现顶上，正式的安卓包里永远不会走到它。
 */
export interface AirMicTransport {
  /** 扫描局域网里的电脑 */
  scan(): Promise<Device[]>
  /** 本机设备信息（id / 名字）—— 发消息时必须带 deviceId */
  getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }>
  /** 申请麦克风权限；返回是否拿到了 */
  requestMicPermission(): Promise<boolean>
  /** 麦克风权限是否已经给了 */
  hasMicPermission(): Promise<boolean>
  /** 把配对 token 存到原生侧（重连时自动带上） */
  saveToken(deviceId: string, token: string): Promise<void>
  /** 连上某台电脑 */
  connect(target: { deviceId: string; host: string; port: number; token?: string }): Promise<void>
  disconnect(): Promise<void>
  /** 发一条控制消息 */
  send(message: Record<string, unknown>): Promise<void>
  /** 收到电脑端的消息 */
  onMessage(handler: (message: Record<string, any>) => void): void
  /** 开始 / 停止手机麦克风（推流） */
  startMic(mode: 'continuous' | 'ptt'): Promise<void>
  stopMic(): Promise<void>
  /** 连接状态变化 */
  onConnection(handler: (state: { connected: boolean; error?: string }) => void): void
  /** 真实麦克风电平（0–1） */
  onLevel(handler: (level: number) => void): void
  /** 系统栏高度（CSS px）—— 页面铺满全屏，需要自己留边距 */
  getInsets(): Promise<{ top: number; bottom: number }>
  /** 设置状态栏图标明暗（浅色背景 → 深色图标） */
  setSystemBars(lightBackground: boolean): Promise<void>
}

/* ------------------------------------------------------------------ *
 * 原生实现（安卓）
 * ------------------------------------------------------------------ */

interface AirMicNativePlugin {
  scan(): Promise<{ devices: Device[] }>
  getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }>
  saveToken(options: { deviceId: string; token: string }): Promise<void>
  checkPermissions(): Promise<Record<string, string>>
  requestPermissions(options: { permissions: string[] }): Promise<Record<string, string>>
  getInsets(): Promise<{ top: number; bottom: number }>
  setSystemBars(options: { light: boolean }): Promise<void>
  connect(options: { deviceId: string; host: string; port: number }): Promise<void>
  disconnect(): Promise<void>
  send(options: { payload: string }): Promise<void>
  startMic(options: { mode: string }): Promise<void>
  stopMic(): Promise<void>
  addListener(event: string, handler: (data: any) => void): Promise<{ remove: () => void }>
}

const AirMicNative = registerPlugin<AirMicNativePlugin>('AirMic')

class NativeTransport implements AirMicTransport {
  async scan(): Promise<Device[]> {
    const result = await AirMicNative.scan()
    return result.devices ?? []
  }

  async getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
    return AirMicNative.getDeviceInfo()
  }

  async saveToken(deviceId: string, token: string): Promise<void> {
    await AirMicNative.saveToken({ deviceId, token })
  }

  async connect(target: {
    deviceId: string
    host: string
    port: number
    token?: string
  }): Promise<void> {
    await AirMicNative.connect(target)
  }

  async requestMicPermission(): Promise<boolean> {
    // 权限别名在插件的 @Permission 上声明（recordAudio → RECORD_AUDIO）
    const result = await AirMicNative.requestPermissions({ permissions: ['recordAudio'] })
    return result.recordAudio === 'granted'
  }

  async hasMicPermission(): Promise<boolean> {
    const status = await AirMicNative.checkPermissions()
    return status.recordAudio === 'granted'
  }

  async disconnect(): Promise<void> {
    await AirMicNative.disconnect()
  }

  async send(message: Record<string, unknown>): Promise<void> {
    await AirMicNative.send({ payload: JSON.stringify(message) })
  }

  async startMic(mode: 'continuous' | 'ptt'): Promise<void> {
    await AirMicNative.startMic({ mode })
  }

  async stopMic(): Promise<void> {
    await AirMicNative.stopMic()
  }

  onMessage(handler: (message: Record<string, any>) => void): void {
    void AirMicNative.addListener('message', (data) => handler(data.payload))
  }

  onConnection(handler: (state: { connected: boolean; error?: string }) => void): void {
    void AirMicNative.addListener('connection', (data) => handler(data))
  }

  onLevel(handler: (level: number) => void): void {
    void AirMicNative.addListener('level', (data) => handler(Number(data.level) || 0))
  }

  async getInsets(): Promise<{ top: number; bottom: number }> {
    return AirMicNative.getInsets()
  }

  async setSystemBars(lightBackground: boolean): Promise<void> {
    await AirMicNative.setSystemBars({ light: lightBackground })
  }
}

/* ------------------------------------------------------------------ *
 * 开发用本地模拟（只在浏览器里跑 UI 时生效）
 * ------------------------------------------------------------------ */

class LoopbackTransport implements AirMicTransport {
  private messageHandlers: ((message: Record<string, any>) => void)[] = []
  private connectionHandlers: ((state: { connected: boolean; error?: string }) => void)[] = []

  async getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
    return { deviceId: 'dev-loopback', deviceName: '开发模式' }
  }

  async requestMicPermission(): Promise<boolean> {
    return true
  }

  async hasMicPermission(): Promise<boolean> {
    return true
  }

  async saveToken(): Promise<void> {
    /* 开发模式不落盘 */
  }

  async scan(): Promise<Device[]> {
    await delay(500)
    return [
      {
        id: 'dev-mac',
        name: '开发用电脑',
        model: 'Loopback',
        signal: 4,
        paired: false,
        lastSeen: Date.now(),
      },
    ]
  }

  async connect(): Promise<void> {
    await delay(300)
    this.connectionHandlers.forEach((handler) => handler({ connected: true }))
    this.emit({
      type: 'welcome',
      pairingRequired: false,
      server: {
        recording: false,
        foregroundApp: '访达',
        foregroundBundleId: 'com.apple.finder',
        outputDeviceId: '',
        bufferMs: 60,
      },
    })
  }

  async disconnect(): Promise<void> {
    this.connectionHandlers.forEach((handler) => handler({ connected: false }))
  }

  async send(): Promise<void> {
    /* 开发模式下不发真实消息 */
  }

  async startMic(): Promise<void> {
    await delay(100)
  }

  async stopMic(): Promise<void> {
    await delay(100)
  }

  onMessage(handler: (message: Record<string, any>) => void): void {
    this.messageHandlers.push(handler)
  }

  onConnection(handler: (state: { connected: boolean; error?: string }) => void): void {
    this.connectionHandlers.push(handler)
  }

  onLevel(handler: (level: number) => void): void {
    /* 开发模式没有真实电平 */
    void handler
  }

  async getInsets(): Promise<{ top: number; bottom: number }> {
    return { top: 0, bottom: 0 }
  }

  async setSystemBars(): Promise<void> {
    /* 开发模式没有系统栏 */
  }

  private emit(message: Record<string, any>) {
    this.messageHandlers.forEach((handler) => handler(message))
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 正式安卓包 → 原生通道；浏览器开发 → 本地模拟 */
export function createTransport(): AirMicTransport {
  return Capacitor.isNativePlatform() ? new NativeTransport() : new LoopbackTransport()
}

/** 当前是不是「只在浏览器里跑 UI」的开发模式 */
export const isDevLoopback = !Capacitor.isNativePlatform()
