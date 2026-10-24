/**
 * AirMic 手机端数据模型
 * ------------------------------------------------------------
 * 字段与电脑端（Swift）一一对应，见 shared/protocol.md。
 * 「磁铁」是可复用的快捷键定义（图标 + 名字 + 按键组合），
 * 预案的磁贴和麦克风按钮的按下/松开都引用它。
 */
import type { HotkeyMagnet } from './hotkey'

export type { HotkeyMagnet }

export type MicState = 'idle' | 'continuous' | 'ptt' | 'muted'

/** 一个快捷键磁贴 = 对某个磁铁的引用 */
export type Tile = {
  id: string
  /** 引用的磁铁 id */
  magnetId: string
}

/**
 * 预案 = 一整套快捷键方案
 * ⚠️ micPressId / micReleaseId 是「麦克风按钮按下/松开时执行的磁铁」，
 * tiles 是**独立**的快捷键磁贴 —— 这是两件不同的事。
 */
export type Preset = {
  id: string
  name: string
  /** 绑定的电脑前台应用名；null = 默认预案 */
  appName: string | null
  /** 绑定的应用 id（重名靠它区分）；null = 默认预案 */
  appId?: string | null
  /** 麦克风按钮「按下」时执行的磁铁 id */
  micPressId: string | null
  /** 麦克风按钮「松开」时执行的磁铁 id */
  micReleaseId: string | null
  /** 独立快捷键磁贴（0–6 个） */
  tiles: Tile[]
  /** 是否为默认预案 */
  isDefault?: boolean
}

/**
 * 电脑端见过的一个应用
 *
 * 用户需求：电脑端记录每一次打开过的不同应用的名字和编号；
 * 重名时用编号区分。手机端可以拉这个列表去绑定预案。
 */
export type KnownApp = {
  /** 稳定编号（bundle id 优先） */
  id: string
  name: string
  bundleId: string
  /** 见过几次 */
  seenCount: number
}

/** 扫描到的电脑 */
export type Device = {
  id: string
  name: string
  /** 机型描述 */
  model: string
  /** 信号强度 0-4 */
  signal: number
  /** 是否已配对 */
  paired: boolean
  /** 最近一次在线时间戳 */
  lastSeen: number
  /** 局域网地址（mDNS 解析出来的） */
  host?: string
  /** 控制通道端口 */
  port?: number
}

/** 电脑端上报的前台应用 */
export type ForegroundApp = {
  name: string
  bundleId: string
  hasPreset: boolean
}

/** 音频管线统计。拿不到真实数据就留空，不编数字。 */
export type Stats = {
  packetLoss: number | null
  jitter: number | null
  underrun: number | null
  latency: number | null
  bufferMs: number
}

export const EMPTY_STATS: Stats = {
  packetLoss: null,
  jitter: null,
  underrun: null,
  latency: null,
  bufferMs: 60,
}

/**
 * 初始磁铁库与默认预案
 * ------------------------------------------------------------
 * 这是**用户配置的种子**，不是假的运行时数据：用户在手机端可以随便改，
 * 改完会同步到电脑端。电脑端也会保留自己那份。
 */
export const SEED_MAGNETS: HotkeyMagnet[] = [
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

/**
 * 默认预案
 *
 * ⚠️ 麦克风按钮的「按下 / 松开」**默认不绑任何按键**（用户明确要求）。
 * 用户想用的话自己去预案编辑里挑磁铁。
 */
export const SEED_PRESETS: Preset[] = [
  {
    id: 'p-default',
    name: '默认预案',
    appName: null,
    appId: null,
    isDefault: true,
    micPressId: null,
    micReleaseId: null,
    tiles: [
      { id: 't1', magnetId: 'm-voice' },
      { id: 't2', magnetId: 'm-send' },
      { id: 't3', magnetId: 'm-search' },
      { id: 't4', magnetId: 'm-play' },
      { id: 't5', magnetId: 'm-undo' },
      { id: 't6', magnetId: 'm-copy' },
    ],
  },
]
