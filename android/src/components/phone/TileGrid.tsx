import { createElement, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { fadeFast, springSnappy } from '@/lib/motion'
import { magnetDisplay, magnetIsBound, type HotkeyMagnet } from '@/lib/hotkey'
import { tileIcon } from './icons'
import type { MagnetGroup } from '@/lib/airmic-data'
import { useAirmic } from '@/lib/airmic-store'

/** 磁贴格子里的一项：磁片，或者磁片组 */
export type TileEntry =
  | { key: string; kind: 'magnet'; magnet: HotkeyMagnet }
  | { key: string; kind: 'group'; group: MagnetGroup }

/**
 * 遥控磁贴
 * ------------------------------------------------------------
 * 需求说明书 §3.3 / DESIGN.md §7.3：
 *   磁贴**只对应电脑快捷键**，三行固定结构 = 图标 / 名称 / 组合键。
 *   磁贴引用「磁片」（图标 + 名字 + 一组按键），磁片没配键时显示暗态，
 *   点击提示「先设置」。固定 3 列 × 2 行，不滚动。
 */
export function TileGrid({
  items,
  onFire,
  onUnbound,
  onHoldStart,
  onHoldEnd,
  onRunGroup,
  runningGroupId,
}: {
  items: TileEntry[]
  /** 点按：按下 + 立即抬起 */
  onFire: (magnet: HotkeyMagnet) => void
  onUnbound: (magnet: HotkeyMagnet) => void
  /** 长按：按下组合键并保持 */
  onHoldStart: (magnet: HotkeyMagnet) => void
  /** 长按松手：松开组合键 */
  onHoldEnd: () => void
  /** 点磁片组：按顺序依次执行 */
  onRunGroup: (group: MagnetGroup) => void
  /** 正在执行的磁片组 id */
  runningGroupId: string | null
}) {
  // ⚠️ 固定 3×2 六个格子 —— 磁片不够时用空位占住，
  // 否则磁贴数量一变，下面的麦克风按钮就会被挤得上下跳。
  const slots: (TileEntry | null)[] = Array.from(
    { length: 6 },
    (_, index) => items[index] ?? null,
  )

  return (
    <div className="grid grid-cols-3 gap-2">
      {slots.map((entry, index) =>
        !entry ? (
          <div
            key={`slot-${index}`}
            aria-hidden
            className="h-[84px] rounded-xl border border-transparent"
          />
        ) : entry.kind === 'magnet' ? (
          <TileButton
            key={entry.key}
            magnet={entry.magnet}
            onFire={onFire}
            onUnbound={onUnbound}
            onHoldStart={onHoldStart}
            onHoldEnd={onHoldEnd}
          />
        ) : (
          <GroupButton
            key={entry.key}
            group={entry.group}
            running={runningGroupId === entry.group.id}
            onRun={onRunGroup}
          />
        ),
      )}
    </div>
  )
}

/** 磁片组按钮：点一下依次执行组里的磁片 */
function GroupButton({
  group,
  running,
  onRun,
}: {
  group: MagnetGroup
  running: boolean
  onRun: (group: MagnetGroup) => void
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onRun(group)}
      whileTap={{ scale: 0.96 }}
      transition={springSnappy}
      aria-label={`${group.name}，${group.steps.length} 步`}
      className={[
        'relative flex h-[84px] flex-col items-center justify-center gap-1 rounded-xl border bg-surface-1 px-1',
        running ? 'border-[var(--color-amber-accent)]' : 'border-border-subtle',
      ].join(' ')}
    >
      {createElement(tileIcon(group.icon), {
        size: 19,
        strokeWidth: 1.7,
        style: {
          color: running
            ? 'var(--color-amber-accent)'
            : 'var(--color-text-secondary)',
        },
      })}
      <span className="max-w-full truncate text-[11px] leading-tight text-text-primary">
        {group.name}
      </span>
      <span className="tabular text-[10px] leading-tight text-text-tertiary">
        {group.steps.length} 步
      </span>
    </motion.button>
  )
}

function TileButton({
  magnet,
  onFire,
  onUnbound,
  onHoldStart,
  onHoldEnd,
}: {
  magnet: HotkeyMagnet
  onFire: (magnet: HotkeyMagnet) => void
  onUnbound: (magnet: HotkeyMagnet) => void
  onHoldStart: (magnet: HotkeyMagnet) => void
  onHoldEnd: () => void
}) {
  const bound = magnetIsBound(magnet)
  const keys = magnetDisplay(magnet)
  const [sent, setSent] = useState(false)
  const [holding, setHolding] = useState(false)
  const timerRef = useRef<number | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const pulseRef = useRef<number | null>(null)
  const holdingRef = useRef(false)
  const { haptic } = useAirmic()

  const stopPulse = () => {
    if (pulseRef.current) {
      window.clearInterval(pulseRef.current)
      pulseRef.current = null
    }
  }

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const flashSent = () => {
    setSent(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setSent(false), 700)
  }

  const handlePointerDown = () => {
    if (!bound) return
    holdingRef.current = false
    clearHoldTimer()
    holdTimerRef.current = window.setTimeout(() => {
      holdingRef.current = true
      setHolding(true)
      onHoldStart(magnet)
      // 长按：持续脉冲，越按越有反馈
      haptic('hold')
      pulseRef.current = window.setInterval(() => haptic('hold'), 450)
    }, 320)
  }

  const handlePointerUp = () => {
    clearHoldTimer()
    stopPulse()
    if (holdingRef.current) {
      holdingRef.current = false
      setHolding(false)
      onHoldEnd()
      return
    }
    if (!bound) {
      onUnbound(magnet)
      return
    }
    onFire(magnet)
    flashSent()
  }

  const handlePointerLeave = () => {
    clearHoldTimer()
    stopPulse()
    if (holdingRef.current) {
      holdingRef.current = false
      setHolding(false)
      onHoldEnd()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (!bound) {
      onUnbound(magnet)
      return
    }
    onFire(magnet)
    flashSent()
  }

  return (
    <motion.button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      animate={{ scale: holding ? 0.97 : 1 }}
      transition={springSnappy}
      aria-label={
        bound
          ? `${magnet.label}，快捷键 ${keys}`
          : `${magnet.label}，未设置快捷键`
      }
      className={[
        'relative flex h-[84px] flex-col items-center justify-center gap-1 rounded-xl border px-1',
        bound
          ? 'border-border-subtle bg-surface-1'
          : 'border-border-subtle bg-surface-1 opacity-45',
        holding ? 'border-[var(--color-amber-accent)]' : '',
      ].join(' ')}
    >
      {/* 三行结构：图标 / 名称 / 组合键 */}
      {createElement(tileIcon(magnet.icon), {
        size: 19,
        strokeWidth: 1.7,
        style: {
          color: bound ? 'var(--color-text-secondary)' : 'var(--color-text-faint)',
        },
      })}
      <span
        className="max-w-full truncate text-[11px] leading-tight"
        style={{
          color: bound ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
        }}
      >
        {magnet.label}
      </span>
      <span className="tabular text-[10px] leading-tight">
        {bound ? (
          <span style={{ color: 'var(--color-text-tertiary)' }}>{keys}</span>
        ) : (
          <span style={{ color: 'var(--color-text-faint)' }}>未设置</span>
        )}
      </span>

      {/* 已发送反馈：短暂的一层琥珀色描边 */}
      {sent && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ opacity: fadeFast, default: springSnappy }}
          className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full"
          style={{ background: 'var(--color-amber-accent)' }}
        >
          <Check size={10} strokeWidth={3} color="var(--color-surface-0)" />
        </motion.span>
      )}
    </motion.button>
  )
}
