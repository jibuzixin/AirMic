import { createElement, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { fadeFast, springSnappy } from '@/lib/motion'
import { magnetHasKey, magnetKeys, type HotkeyMagnet } from '@/lib/hotkey'
import { tileIcon } from './icons'

/**
 * 遥控磁贴
 * ------------------------------------------------------------
 * 需求说明书 §3.3 / DESIGN.md §7.3：
 *   磁贴**只对应电脑快捷键**，三行固定结构 = 图标 / 名称 / 组合键。
 *   磁贴引用「磁铁」（图标 + 名字 + 一组按键），磁铁没配键时显示暗态，
 *   点击提示「先设置」。固定 3 列 × 2 行，不滚动。
 */
export function TileGrid({
  magnets,
  onFire,
  onUnbound,
}: {
  magnets: HotkeyMagnet[]
  onFire: (magnet: HotkeyMagnet) => void
  onUnbound: (magnet: HotkeyMagnet) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {magnets.map((magnet) => (
        <TileButton
          key={magnet.id}
          magnet={magnet}
          onFire={onFire}
          onUnbound={onUnbound}
        />
      ))}
    </div>
  )
}

function TileButton({
  magnet,
  onFire,
  onUnbound,
}: {
  magnet: HotkeyMagnet
  onFire: (magnet: HotkeyMagnet) => void
  onUnbound: (magnet: HotkeyMagnet) => void
}) {
  const bound = magnetHasKey(magnet)
  const keys = magnetKeys(magnet)
  const [sent, setSent] = useState(false)
  const timerRef = useRef<number | null>(null)

  const handleClick = () => {
    if (!bound) {
      onUnbound(magnet)
      return
    }
    onFire(magnet)
    setSent(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setSent(false), 700)
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.96 }}
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
