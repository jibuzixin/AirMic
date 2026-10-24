import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff } from 'lucide-react'

/**
 * 麦克风主按钮 —— 全 App 最重要的交互
 * ------------------------------------------------------------
 * 双语义：
 *   点击 (<220ms) = 常开收音 / 再点关闭
 *   长按 (>220ms) = 瞬时说话，松开即停
 *
 * 物理：
 *   按下 scale 0.96 + 阴影收紧
 *   释放 springBouncy 回弹，带轻微过冲 (overshoot ≈ 1.02)
 */
const LONG_PRESS_MS = 220

export function MicButton({
  mode, // 'idle' | 'continuous' | 'ptt'
  onToggleContinuous,
  onPushToTalkStart,
  onPushToTalkEnd,
  size = 132,
  showLabel = true,
}: {
  mode: 'idle' | 'continuous' | 'ptt'
  onToggleContinuous: () => void
  onPushToTalkStart: () => void
  onPushToTalkEnd: () => void
  size?: number
  /** 放在电平表环心时关掉内嵌状态文字，改由外层排版 */
  showLabel?: boolean
}) {
  const timerRef = useRef<number | null>(null)
  const heldRef = useRef(false)
  const [pressed, setPressed] = useState(false)

  const clear = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handlePointerDown = () => {
    setPressed(true)
    heldRef.current = false
    timerRef.current = window.setTimeout(() => {
      heldRef.current = true
      onPushToTalkStart()
    }, LONG_PRESS_MS)
  }

  const handlePointerUp = () => {
    setPressed(false)
    clear()
    if (heldRef.current) {
      // 走的是长按路径 —— 松开即停
      heldRef.current = false
      onPushToTalkEnd()
    } else {
      // 走的是点击路径 —— 切换常开
      onToggleContinuous()
    }
  }

  const handlePointerLeave = () => {
    // 手指滑出按钮：取消长按判定
    if (pressed) {
      setPressed(false)
      clear()
      if (heldRef.current) {
        heldRef.current = false
        onPushToTalkEnd()
      }
    }
  }

  const isActive = mode === 'continuous' || mode === 'ptt'
  const isPtt = mode === 'ptt'

  const bg = isActive
    ? isPtt
      ? 'var(--color-recording)'
      : 'var(--color-amber-accent)'
    : 'var(--color-surface-2)'

  const ringColor = isActive
    ? isPtt
      ? 'var(--color-recording)'
      : 'var(--color-amber-accent)'
    : 'var(--color-border-strong)'

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      {/* 活跃光环 */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="halo"
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              border: `2px solid ${ringColor}`,
            }}
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.55 }}
            exit={{ scale: 1.12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          />
        )}
      </AnimatePresence>

      {/* 主按钮 */}
      <motion.button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={isActive ? '停止收音' : '开始收音'}
        className="relative grid place-items-center rounded-full select-none"
        style={{
          width: size * 0.74,
          height: size * 0.74,
          background: bg,
          cursor: 'pointer',
          touchAction: 'none',
          userSelect: 'none',
        }}
        animate={{
          scale: pressed ? 0.96 : 1,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        whileTap={{ scale: 0.96 }}
      >
        {/* 语音波形装饰 —— 仅活跃时显示
            注意：不能用 repeat:Infinity 的关键帧动画。
            AnimatePresence 的退出会沿用同一份 transition，
            无限重复会让退出动画永远跑不完，红色波纹会卡在屏幕上。
            这里改成一次性 spring 进场 / 退场，动效由电平表承担。 */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              key="wave"
              className="absolute rounded-full"
              style={{
                width: size * 0.56,
                height: size * 0.56,
                border: `1.5px solid ${ringColor}`,
              }}
              initial={{ scale: 0.82, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.35 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
        </AnimatePresence>

        <Icon mode={mode} />
      </motion.button>

      {/* 状态文字 */}
      {showLabel && (
        <div className="absolute -bottom-7 text-center">
          <StatusLabel mode={mode} />
        </div>
      )}
    </div>
  )
}

/**
 * 图标表达的是**当前状态**，不是「点了会发生什么」：
 *   待机（没在收音） → 麦克风是关的 → MicOff
 *   收音中           → 麦克风是开着的 → Mic
 * （颜色另外承担状态语义：琥珀=常开，红色=瞬时）
 */
function Icon({ mode }: { mode: 'idle' | 'continuous' | 'ptt' }) {
  if (mode === 'idle') {
    return (
      <MicOff
        size={44}
        strokeWidth={1.6}
        style={{ color: 'var(--color-text-secondary)' }}
      />
    )
  }
  return (
    <motion.div
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <Mic
        size={44}
        strokeWidth={1.8}
        style={{
          color: mode === 'ptt' ? '#fff' : 'var(--color-surface-0)',
        }}
      />
    </motion.div>
  )
}

function StatusLabel({ mode }: { mode: 'idle' | 'continuous' | 'ptt' }) {
  const text =
    mode === 'continuous' ? '常开收音中' : mode === 'ptt' ? '正在说话…' : '点按收音 · 长按说话'
  const color =
    mode === 'continuous'
      ? 'var(--color-amber-accent)'
      : mode === 'ptt'
        ? 'var(--color-recording)'
        : 'var(--color-text-tertiary)'

  return (
    <motion.span
      key={text}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="text-[11px] whitespace-nowrap"
      style={{ color }}
    >
      {text}
    </motion.span>
  )
}
