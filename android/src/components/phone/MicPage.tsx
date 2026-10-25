import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, SlidersHorizontal } from 'lucide-react'
import { LevelRing } from '@/components/LevelRing'
import { MicButton } from '@/components/MicButton'
import { useActivePreset, useAirmic } from '@/lib/airmic-store'
import { fadeFast, springSmooth } from '@/lib/motion'
import { magnetHasKey, magnetKeys, type HotkeyMagnet } from '@/lib/hotkey'
import { TileGrid } from './TileGrid'

/**
 * 手机端麦克风页 —— 主控界面
 * ------------------------------------------------------------
 * 硬约束（需求说明书 §3.3 / DESIGN.md §7.2）：
 *   - **完全不滚动**，一屏放下
 *   - 环形电平表 300px，麦克风按钮在环心
 *   - 底部 3×2 磁贴，只对应电脑快捷键
 *   - 预案切换用顶部细状态条，不用弹窗（§4.3）
 *
 * 这一页要能一眼讲清两件事的区别：
 *   ① 麦克风按钮自己的「按下 / 松开」快捷键  → 环下方的两枚键位芯片
 *   ② 独立的快捷键磁贴                        → 底部 3×2
 *
 * 两处快捷键都引用「磁铁」：图标 + 名字 + 一组按键，全局共享。
 */
export function MicPage({
  onOpenPresets,
  onEditMicBindings,
}: {
  onOpenPresets: () => void
  /** 点「按下 / 松开」键位芯片 → 直接打开快捷键设置 */
  onEditMicBindings: () => void
}) {
  const {
    micMode,
    paired,
    pairedDevice,
    foregroundApp,
    presetNotice,
    magnets,
    serverRunning,
    toggleContinuous,
    startPushToTalk,
    endPushToTalk,
    micBlockedNotice,
    dismissMicBlocked,
    fireMagnet,
    remoteError,
    dismissRemoteError,
    micLevel,
  } = useAirmic()
  const preset = useActivePreset()
  // ⚠️ 用**真实**麦克风电平（原生采集算出来的 RMS）——
  // 原型里这里是随机数，看着在动其实什么也没采到
  const level = micLevel
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  /**
   * 预案刚切换过的「强调」状态：琥珀点闪一下，2 秒后退回中性。
   * 预案条本身是常驻的，不会消失。
   */
  const [switching, setSwitching] = useState(false)
  const [lastSeq, setLastSeq] = useState(presetNotice?.seq ?? 0)
  if (presetNotice && presetNotice.seq !== lastSeq) {
    setLastSeq(presetNotice.seq)
    setSwitching(true)
  }

  useEffect(() => {
    if (!switching) return
    const timer = window.setTimeout(() => setSwitching(false), 2000)
    return () => window.clearTimeout(timer)
  }, [switching])

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  /**
   * 电脑端返回的错误（比如快捷键没有辅助功能权限）——
   * 直接显示出来，不然用户点了没反应又不知道原因。
   */
  useEffect(() => {
    if (!remoteError) return
    showToast(remoteError)
    const timer = window.setTimeout(dismissRemoteError, 3000)
    return () => window.clearTimeout(timer)
  }, [dismissRemoteError, remoteError, showToast])

  /**
   * 电脑端没有在收音时，手机开始收音要**震动 + 提示**
   * （硬约束 15）。提示条不打断说话动作。
   */
  useEffect(() => {
    if (!micBlockedNotice) return
    showToast(micBlockedNotice)
    const timer = window.setTimeout(dismissMicBlocked, 2200)
    return () => window.clearTimeout(timer)
  }, [dismissMicBlocked, micBlockedNotice, showToast])

  /* ---------- 磁铁解析 ---------- */

  /** 磁贴只引用磁铁 id，这里解析成磁铁本体 */
  const tileMagnets = useMemo(
    () =>
      (preset?.tiles ?? [])
        .map((tile) => magnets.find((m) => m.id === tile.magnetId))
        .filter((magnet): magnet is HotkeyMagnet => magnet !== undefined),
    [preset?.tiles, magnets],
  )

  const pressMagnet = useMemo(
    () => magnets.find((m) => m.id === preset?.micPressId) ?? null,
    [magnets, preset?.micPressId],
  )
  const releaseMagnet = useMemo(
    () => magnets.find((m) => m.id === preset?.micReleaseId) ?? null,
    [magnets, preset?.micReleaseId],
  )
  const holdMagnet = useMemo(
    () => magnets.find((m) => m.id === preset?.micHoldId) ?? null,
    [magnets, preset?.micHoldId],
  )

  /* ---------- 电脑端没在收音时的提醒 ---------- */

  /**
   * 电脑端菜单栏点「停止收音」后，手机这边说话传不过去。
   * 用户按下麦克风的那一瞬间：震一下 + 顶部一条细提示条。
   * 提示条不打断收音 —— 用户可能已经在说话了，不能把他的动作打断。
   */
  const [captureBlocked, setCaptureBlocked] = useState(false)
  const blockedTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (blockedTimer.current) window.clearTimeout(blockedTimer.current)
    }
  }, [])

  const notifyCaptureBlocked = useCallback(() => {
    if (serverRunning) return
    vibrate()
    setCaptureBlocked(true)
    if (blockedTimer.current) window.clearTimeout(blockedTimer.current)
    blockedTimer.current = window.setTimeout(() => setCaptureBlocked(false), 3000)
  }, [serverRunning])

  /** 点按 = 常开收音；只有从 idle 切进来才算「开始收音」 */
  const handleToggleContinuous = useCallback(() => {
    if (micMode === 'idle') notifyCaptureBlocked()
    toggleContinuous()
  }, [micMode, notifyCaptureBlocked, toggleContinuous])

  /** 长按 = 瞬时说话，起手就要提醒 */
  const handlePushToTalkStart = useCallback(() => {
    notifyCaptureBlocked()
    startPushToTalk()
  }, [notifyCaptureBlocked, startPushToTalk])

  /* ---------- 磁贴 ---------- */

  const handleFire = useCallback(
    (magnet: HotkeyMagnet) => {
      // ⚠️ 必须真的发给电脑 —— 原型里这里只弹了个 toast，什么都没发
      fireMagnet(magnet)
      showToast(`已发送 ${magnetKeys(magnet)}`)
    },
    [fireMagnet, showToast],
  )

  const handleUnbound = useCallback(
    (magnet: HotkeyMagnet) => {
      showToast(`「${magnet.label}」还没设置快捷键，先去设置`)
    },
    [showToast],
  )

  const hint =
    micMode === 'continuous'
      ? '常开收音中 · 再点一次关闭'
      : micMode === 'ptt'
        ? '正在说话… 松开即停'
        : '点按收音 · 长按说话'

  return (
    <div className="relative flex h-full flex-col">
      {/* ---------- 顶栏 ---------- */}
      <header className="shrink-0 px-4">
        <div className="flex h-12 items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{
                background: paired
                  ? 'var(--color-connected)'
                  : 'var(--color-text-tertiary)',
              }}
              aria-label={paired ? '已连接' : '未连接'}
            />
            <span
              className={
                paired
                  ? 'truncate text-[13px] font-medium text-text-primary'
                  : 'truncate text-[13px] font-medium text-text-tertiary'
              }
            >
              {pairedDevice?.name ?? (paired ? '已连接' : '未连接')}
            </span>
            <span className="tabular shrink-0 text-[11px] text-text-tertiary">
              {foregroundApp.name}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenPresets}
            aria-label="预案与设备设置"
            className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
          >
            <SlidersHorizontal size={17} strokeWidth={1.7} />
          </button>
        </div>

        {/* ---------- 当前预案（常驻，不自动消失） ----------
            切电脑端应用时预案会变，这里必须一直看得见当前用的是哪一套。
            切换的瞬间闪一下琥珀点做强调，然后退回中性色。 */}
        <div className="flex items-center gap-2 pb-2">
          <span
            className="size-1.5 shrink-0 rounded-full transition-colors"
            style={{
              background: switching
                ? 'var(--color-amber-accent)'
                : 'var(--color-text-tertiary)',
            }}
          />
          <span className="text-[10px] text-text-tertiary">当前预案</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={preset?.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={fadeFast}
              className="truncate text-[11px] font-medium text-text-primary"
            >
              {preset?.name ?? '--'}
            </motion.span>
          </AnimatePresence>
          {preset?.appName && (
            <span className="truncate text-[10px] text-text-faint">
              · {preset.appName}
            </span>
          )}
        </div>
      </header>

      {/* ---------- 电脑端没在收音的提醒条 ----------
          绝对定位：出现和消失都不改变布局 —— 用户可能正按着麦克风说话，
          布局一变按钮就会从手指底下挪走。也不遮挡电平表。 */}
      <AnimatePresence>
        {captureBlocked && (
          <motion.div
            key="capture-blocked"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={fadeFast}
            className="pointer-events-none absolute inset-x-0 top-[72px] z-20 px-4"
          >
            <div className="flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-2 px-3 py-2">
              <AlertTriangle
                size={13}
                strokeWidth={1.8}
                className="mt-[3px] shrink-0"
                style={{ color: 'var(--color-recording)' }}
              />
              <div className="min-w-0">
                <p className="text-[11px] leading-tight text-text-secondary">
                  电脑端没有在收音，声音传不过去
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-text-tertiary">
                  在电脑端点「开始收音」后再说话
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- 电平表 + 麦克风按钮 ---------- */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <div className="relative" style={{ width: 300, height: 300 }}>
          <LevelRing level={level} active={micMode !== 'idle'} state={micMode} />
          {/* 麦克风按钮放在环心 */}
          <div className="absolute inset-0 grid place-items-center">
            <MicButton
              mode={micMode}
              size={150}
              showLabel={false}
              onToggleContinuous={handleToggleContinuous}
              onPushToTalkStart={handlePushToTalkStart}
              onPushToTalkEnd={endPushToTalk}
            />
          </div>
        </div>

        <p className="text-[11px] leading-none text-text-tertiary">{hint}</p>

        {/* 麦克风按钮自己的三个绑定 —— 和下面的独立磁贴是两件事。
            芯片可点：点一下直接去设置，这是麦克风按钮快捷键的入口。 */}
        <div className="flex items-center gap-2">
          <HotkeyChip
            label="点按开"
            magnet={pressMagnet}
            onClick={onEditMicBindings}
          />
          <HotkeyChip
            label="点按关"
            magnet={releaseMagnet}
            onClick={onEditMicBindings}
          />
          <HotkeyChip
            label="长按"
            magnet={holdMagnet}
            onClick={onEditMicBindings}
          />
        </div>
      </div>

      {/* ---------- 独立快捷键磁贴 ---------- */}
      <div className="shrink-0 px-4 pb-4">
        <TileGrid
          magnets={tileMagnets}
          onFire={handleFire}
          onUnbound={handleUnbound}
        />
      </div>

      {/* ---------- 轻提示 ---------- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ opacity: fadeFast, default: springSmooth }}
            className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-8"
          >
            <span className="rounded-full border border-border-subtle bg-surface-2 px-3 py-1.5 text-[11px] text-text-secondary">
              {toast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * 震动。
 * iOS Safari 没有这个 API，所以先判断再用；不支持就什么都不做 ——
 * 视觉提示条才是主要的反馈渠道，不能假装震过。
 */
function vibrate(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }
  try {
    navigator.vibrate([40, 60, 40])
  } catch {
    // 某些浏览器在页面不可见时会抛错，忽略即可
  }
}

/** 一枚快捷键芯片：标签 + 等宽组合键 */
function HotkeyChip({
  label,
  magnet,
  onClick,
}: {
  label: string
  magnet: HotkeyMagnet | null
  onClick: () => void
}) {
  const bound = magnetHasKey(magnet)
  const keys = bound ? magnetKeys(magnet) : ''

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`设置麦克风按钮${label}时触发的快捷键，当前 ${
        bound ? keys : '未设置'
      }`}
      className="flex h-11 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-3 transition-colors hover:border-border-strong hover:bg-surface-2 active:scale-[0.97]"
    >
      <span className="text-[10px] text-text-tertiary">{label}</span>
      {bound ? (
        <span className="tabular text-[11px] text-text-secondary">{keys}</span>
      ) : (
        <span className="text-[11px] text-text-faint">未设置</span>
      )}
    </button>
  )
}
