/**
 * AirMic 原型数据模型
 * ------------------------------------------------------------
 * 「磁铁」是可复用的快捷键定义（图标 + 名字 + 按键组合），
 * 预案的磁贴和麦克风按钮的按下/松开都引用它。详见 `src/lib/hotkey.ts`。
 */
import type { HotkeyMagnet } from './hotkey'

export type MicState = 'idle' | 'continuous' | 'ptt' | 'muted'

/** 一个快捷键磁贴 = 对某个磁铁的引用 */
export type Tile = {
  id: string
  /** 引用的磁铁 id（磁铁库见 MAGNETS / store.magnets） */
  magnetId: string
}

/** 预案 = 一整套快捷键方案 */
export type Preset = {
  id: string
  name: string
  /** 绑定的电脑前台应用名；null = 默认预案 */
  appName: string | null
  /** 麦克风按钮「按下」时执行的磁铁 id */
  micPressId: string | null
  /** 麦克风按钮「松开」时执行的磁铁 id */
  micReleaseId: string | null
  /** 独立快捷键磁贴（不与麦克风绑定） */
  tiles: Tile[]
  /** 是否为默认预案 */
  isDefault?: boolean
}

/** 发现的设备 */
export type Device = {
  id: string
  name: string
  /** 机型描述，如 "iPhone 15 Pro" */
  model: string
  /** 信号强度 0-4 */
  signal: number
  /** 是否已配对 */
  paired: boolean
  /** 最近一次在线时间戳 */
  lastSeen: number
}

/** 电脑端前台应用 */
export type ForegroundApp = {
  name: string
  /** bundle id 风格标识 */
  bundleId: string
  /** 是否是当前有绑定预案的应用 */
  hasPreset: boolean
}

export const FOREGROUND_APPS: ForegroundApp[] = [
  { name: '微信', bundleId: 'com.tencent.xinWeChat', hasPreset: true },
  { name: '终端', bundleId: 'com.apple.Terminal', hasPreset: true },
  { name: 'Notion', bundleId: 'notion.id', hasPreset: true },
  { name: 'Safari', bundleId: 'com.apple.Safari', hasPreset: false },
  { name: 'VS Code', bundleId: 'com.microsoft.VSCode', hasPreset: false },
  { name: 'Final Cut Pro', bundleId: 'com.apple.FinalCut', hasPreset: false },
]

/**
 * 快捷键磁铁库（全局，跨预案复用）
 * ------------------------------------------------------------
 * 每个磁铁 = 图标 + 名字 + 一组按键。
 * 磁铁被预案的磁贴和麦克风按钮的按下/松开共同引用。
 */
export const MAGNETS: HotkeyMagnet[] = [
  { id: 'm-voice', label: '语音输入', icon: 'Mic', modifiers: ['cmd', 'shift'], key: 'v', mouse: null },
  { id: 'm-send', label: '发送', icon: 'Send', modifiers: ['cmd'], key: 'enter', mouse: null },
  { id: 'm-shot', label: '截图', icon: 'Camera', modifiers: ['cmd', 'shift'], key: '4', mouse: null },
  { id: 'm-copy', label: '复制', icon: 'Copy', modifiers: ['cmd'], key: 'c', mouse: null },
  { id: 'm-paste', label: '粘贴', icon: 'ClipboardPaste', modifiers: ['cmd'], key: 'v', mouse: null },
  { id: 'm-undo', label: '撤销', icon: 'Undo', modifiers: ['cmd'], key: 'z', mouse: null },
  { id: 'm-redo', label: '重做', icon: 'Redo2', modifiers: ['cmd', 'shift'], key: 'z', mouse: null },
  { id: 'm-search', label: '全局搜索', icon: 'Search', modifiers: ['cmd'], key: 'space', mouse: null },
  { id: 'm-play', label: '播放暂停', icon: 'Play', modifiers: ['cmd', 'shift'], key: 'p', mouse: null },
  { id: 'm-mute', label: '静音', icon: 'VolumeX', modifiers: ['cmd', 'shift'], key: 'm', mouse: null },
  { id: 'm-record', label: '开始录音', icon: 'Mic', modifiers: ['ctrl'], key: 'space', mouse: null },
  { id: 'm-stop', label: '停止', icon: 'Square', modifiers: ['ctrl', 'shift'], key: 'space', mouse: null },
  { id: 'm-newtab', label: '新标签', icon: 'Terminal', modifiers: ['cmd'], key: 't', mouse: null },
  { id: 'm-history', label: '历史', icon: 'Clock', modifiers: ['cmd'], key: 'r', mouse: null },
  { id: 'm-bold', label: '加粗', icon: 'Bold', modifiers: ['cmd'], key: 'b', mouse: null },
  { id: 'm-italic', label: '斜体', icon: 'Italic', modifiers: ['cmd'], key: 'i', mouse: null },
  { id: 'm-link', label: '链接', icon: 'Link', modifiers: ['cmd'], key: 'k', mouse: null },
]

export const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'p-default',
    name: '默认预案',
    appName: null,
    isDefault: true,
    micPressId: 'm-voice',
    micReleaseId: 'm-send',
    tiles: [
      { id: 't1', magnetId: 'm-voice' },
      { id: 't2', magnetId: 'm-send' },
      { id: 't3', magnetId: 'm-search' },
      { id: 't4', magnetId: 'm-play' },
      { id: 't5', magnetId: 'm-undo' },
      { id: 't6', magnetId: 'm-copy' },
    ],
  },
  {
    id: 'p-wechat',
    name: '聊天预案',
    appName: '微信',
    micPressId: 'm-voice',
    micReleaseId: 'm-send',
    tiles: [
      { id: 't1', magnetId: 'm-voice' },
      { id: 't2', magnetId: 'm-send' },
      { id: 't3', magnetId: 'm-shot' },
      { id: 't4', magnetId: 'm-copy' },
      { id: 't5', magnetId: 'm-search' },
      { id: 't6', magnetId: 'm-undo' },
    ],
  },
  {
    id: 'p-terminal',
    name: '终端预案',
    appName: '终端',
    micPressId: 'm-record',
    micReleaseId: null,
    tiles: [
      { id: 't1', magnetId: 'm-record' },
      { id: 't2', magnetId: 'm-stop' },
      { id: 't3', magnetId: 'm-newtab' },
      { id: 't4', magnetId: 'm-history' },
      { id: 't5', magnetId: 'm-copy' },
      { id: 't6', magnetId: 'm-undo' },
    ],
  },
  {
    id: 'p-notion',
    name: '写作预案',
    appName: 'Notion',
    micPressId: 'm-voice',
    micReleaseId: null,
    tiles: [
      { id: 't1', magnetId: 'm-voice' },
      { id: 't2', magnetId: 'm-bold' },
      { id: 't3', magnetId: 'm-italic' },
      { id: 't4', magnetId: 'm-link' },
      { id: 't5', magnetId: 'm-search' },
      { id: 't6', magnetId: 'm-copy' },
    ],
  },
]

/** 可被扫描到的设备 */
export const SCANNABLE_DEVICES: Device[] = [
  { id: 'd1', name: "Mavis 的 iPhone", model: 'iPhone 15 Pro', signal: 4, paired: true, lastSeen: Date.now() },
  { id: 'd2', name: 'iPad Air', model: 'iPad Air 5', signal: 3, paired: false, lastSeen: Date.now() },
  { id: 'd3', name: '小王的 Android', model: 'Pixel 8', signal: 2, paired: false, lastSeen: Date.now() - 60000 },
  { id: 'd4', name: 'iPhone SE', model: 'iPhone SE 3', signal: 1, paired: false, lastSeen: Date.now() - 300000 },
]

/** 电脑端统计（真实场景下由音频管线提供，这里是占位） */
export type Stats = {
  packetLoss: number
  jitter: number
  underrun: number
  latency: number
  bufferMs: number
}

export const INITIAL_STATS: Stats = {
  packetLoss: 0.2,
  jitter: 3.4,
  underrun: 0,
  latency: 28,
  bufferMs: 40,
}
