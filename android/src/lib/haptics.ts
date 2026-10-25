/**
 * 震动反馈
 * ------------------------------------------------------------
 * 只在安卓上有 navigator.vibrate（iOS 没有，必须保护）。
 * 强度只有两档：轻 / 标准 —— 节奏上的差别，Web 控制不了更细的力度。
 */
export type HapticKind = 'tap' | 'hold' | 'warn'
export type HapticStrength = 'light' | 'normal'

const PATTERNS: Record<HapticStrength, Record<HapticKind, number | number[]>> = {
  light: { tap: 8, hold: 22, warn: [60, 40, 60] },
  normal: { tap: 16, hold: 40, warn: [120, 60, 120] },
}

export function hapticPattern(
  kind: HapticKind,
  strength: HapticStrength,
): number | number[] {
  return PATTERNS[strength][kind]
}

/** 直接震一下（存储层判断开关后调用） */
export function vibrate(kind: HapticKind, strength: HapticStrength): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }
  try {
    navigator.vibrate(hapticPattern(kind, strength))
  } catch {
    /* 页面不可见时某些浏览器会抛错，忽略 */
  }
}
