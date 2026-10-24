/**
 * 快捷键「磁铁」
 * ------------------------------------------------------------
 * 一个磁铁 = 图标 + 名字 + 一组按键（键盘 + 鼠标）。
 *
 * 它是**可复用**的：
 *   - 预案底部的磁贴引用磁铁
 *   - 麦克风按钮的「按下 / 松开」也引用磁铁
 * 所以磁铁库是全局的，不属于某一套预案。
 *
 * 显示串（⌘⇧V）和发给电脑的组合键（['cmd','shift','v']）都是**算出来的**，
 * 不作为字段存 —— 避免两处数据不一致。
 */

export type ModifierKey = 'cmd' | 'shift' | 'ctrl' | 'alt'

export type MouseKey = 'left' | 'right' | 'middle' | 'wheelUp' | 'wheelDown'

export type HotkeyMagnet = {
  id: string
  /** 磁铁的名字 */
  label: string
  /** 图标名（lucide-react） */
  icon: string
  /** 修饰键 */
  modifiers: ModifierKey[]
  /** 主键（键盘）。用鼠标键时为 null */
  key: string | null
  /** 鼠标键。用键盘键时为 null */
  mouse: MouseKey | null
}

/* ---------- 修饰键 ---------- */

export const MODIFIERS: {
  id: ModifierKey
  /** macOS 习惯的显示顺序：⌃⌥⇧⌘ */
  order: number
  symbol: string
  label: string
}[] = [
  { id: 'ctrl', order: 0, symbol: '⌃', label: 'Control' },
  { id: 'alt', order: 1, symbol: '⌥', label: 'Option' },
  { id: 'shift', order: 2, symbol: '⇧', label: 'Shift' },
  { id: 'cmd', order: 3, symbol: '⌘', label: 'Command' },
]

/* ---------- 键盘主键 ---------- */

export type KeyChoice = {
  /** 发给电脑的键名 */
  id: string
  /** 界面显示 */
  label: string
  group: '字母' | '数字' | '功能键' | '编辑键' | '方向键' | '符号'
}

export const KEY_CHOICES: KeyChoice[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => ({
    id: c,
    label: c.toUpperCase(),
    group: '字母' as const,
  })),
  ...'0123456789'.split('').map((c) => ({
    id: c,
    label: c,
    group: '数字' as const,
  })),
  { id: 'space', label: 'Space', group: '编辑键' },
  { id: 'enter', label: '⏎', group: '编辑键' },
  { id: 'tab', label: '⇥', group: '编辑键' },
  { id: 'escape', label: '⎋', group: '编辑键' },
  { id: 'backspace', label: '⌫', group: '编辑键' },
  { id: 'delete', label: '⌦', group: '编辑键' },
  { id: 'home', label: '↖', group: '编辑键' },
  { id: 'end', label: '↘', group: '编辑键' },
  { id: 'pageup', label: '⇞', group: '编辑键' },
  { id: 'pagedown', label: '⇟', group: '编辑键' },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `f${i + 1}`,
    label: `F${i + 1}`,
    group: '功能键' as const,
  })),
  { id: 'arrowup', label: '↑', group: '方向键' },
  { id: 'arrowdown', label: '↓', group: '方向键' },
  { id: 'arrowleft', label: '←', group: '方向键' },
  { id: 'arrowright', label: '→', group: '方向键' },
  { id: 'comma', label: ',', group: '符号' },
  { id: 'period', label: '.', group: '符号' },
  { id: 'slash', label: '/', group: '符号' },
  { id: 'semicolon', label: ';', group: '符号' },
  { id: 'quote', label: "'", group: '符号' },
  { id: 'bracketleft', label: '[', group: '符号' },
  { id: 'bracketright', label: ']', group: '符号' },
  { id: 'minus', label: '-', group: '符号' },
  { id: 'equal', label: '=', group: '符号' },
  { id: 'backquote', label: '`', group: '符号' },
  { id: 'backslash', label: '\\', group: '符号' },
]

/* ---------- 鼠标键 ---------- */

export const MOUSE_CHOICES: { id: MouseKey; label: string }[] = [
  { id: 'left', label: '左键' },
  { id: 'right', label: '右键' },
  { id: 'middle', label: '中键' },
  { id: 'wheelUp', label: '滚轮上' },
  { id: 'wheelDown', label: '滚轮下' },
]

/* ---------- 组合键的显示与下发 ---------- */

/** 鼠标键在发往电脑时的键名 */
const MOUSE_COMBO: Record<MouseKey, string> = {
  left: 'mouse1',
  right: 'mouse2',
  middle: 'mouse3',
  wheelUp: 'wheelup',
  wheelDown: 'wheeldown',
}

/** 键盘主键在发往电脑时的键名（与 CGEvent 对齐） */
const KEY_COMBO: Record<string, string> = {
  space: 'space',
  enter: 'enter',
  tab: 'tab',
  escape: 'escape',
  backspace: 'backspace',
  delete: 'delete',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pagedown: 'pagedown',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
}

/**
 * 显示串，如「⌘⇧V」「⌘Space」「左键」
 * 没有配任何键时返回空串 —— 调用方负责显示「未设置」。
 */
export function magnetKeys(magnet: HotkeyMagnet | null | undefined): string {
  if (!magnet) return ''
  const mods = MODIFIERS.filter((m) => magnet.modifiers.includes(m.id))
    .sort((a, b) => a.order - b.order)
    .map((m) => m.symbol)
    .join('')

  if (magnet.mouse) {
    const mouse = MOUSE_CHOICES.find((m) => m.id === magnet.mouse)
    return `${mods}${mouse ? mouse.label : ''}`
  }
  if (!magnet.key) return mods

  const choice = KEY_CHOICES.find((k) => k.id === magnet.key)
  const main = choice ? choice.label : magnet.key.toUpperCase()
  // 单个字母 + 无修饰键 → 显示小写更常见（⌘v 写成 ⌘V 也行，统一大写）
  return `${mods}${main}`
}

/**
 * 发往电脑的组合键数组，如 ['cmd','shift','v']
 */
export function magnetCombo(magnet: HotkeyMagnet | null | undefined): string[] {
  if (!magnet) return []
  const combo: string[] = [...magnet.modifiers]
  if (magnet.mouse) {
    combo.push(MOUSE_COMBO[magnet.mouse])
  } else if (magnet.key) {
    combo.push(KEY_COMBO[magnet.key] ?? magnet.key)
  }
  return combo
}

/** 磁铁是否已经配了至少一个键 */
export function magnetHasKey(magnet: HotkeyMagnet | null | undefined): boolean {
  if (!magnet) return false
  return magnet.mouse !== null || magnet.key !== null
}
