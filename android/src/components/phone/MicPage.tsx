import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SlidersHorizontal, RefreshCw, Settings } from 'lucide-react'
import { LevelRing } from '@/components/LevelRing'
import { MicButton } from '@/components/MicButton'
import { useActivePreset, useAirmic } from '@/lib/airmic-store'
import { fadeFast, springSmooth } from '@/lib/motion'
import { magnetDisplay, magnetIsBound, magnetIsText, type HotkeyMagnet } from '@/lib/hotkey'
import type { MagnetGroup } from '@/lib/airmic-data'
import { TileGrid, type TileEntry } from './TileGrid'

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
 * 两处快捷键都引用「磁片」：图标 + 名字 + 一组按键，全局共享。
 */
export function MicPage({
  onOpenPresets,
  onOpenSettings,
  onEditMicBindings,
}: {
  onOpenPresets: () => void
  /** 直达设置页（和预案并列放在右上角） */
  onOpenSettings: () => void
  /** 点「按下 / 松开」键位芯片 → 直接打开快捷键设置 */
  onEditMicBindings: () => void
}) {
  const {
    micMode,
    paired,
    connected,
    shouldWarnServerIdle,
    haptic,
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
    groups,
    runGroup,
    runningGroupId,
    fireMagnet,
    holdTileMagnet,
    releaseTileMagnet,
    remoteError,
    dismissRemoteError,
    micAutoStopNotice,
    dismissMicAutoStop,
    reconnect,
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

  /** 静默自动关麦的提示 */
  useEffect(() => {
    if (!micAutoStopNotice) return
    showToast(micAutoStopNotice)
    const timer = window.setTimeout(dismissMicAutoStop, 2600)
    return () => window.clearTimeout(timer)
  }, [dismissMicAutoStop, micAutoStopNotice, showToast])

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

  /* ---------- 磁片解析 ---------- */

  /** 磁贴引用磁片或磁片组，这里解析成本体 */
  const tileItems = useMemo(() => {
    const entries: TileEntry[] = []
    for (const tile of preset?.tiles ?? []) {
      if (tile.groupId) {
        const group = groups.find((g) => g.id === tile.groupId)
        if (group) entries.push({ key: tile.id, kind: 'group', group })
        continue
      }
      const magnet = magnets.find((m) => m.id === tile.magnetId)
      if (magnet) entries.push({ key: tile.id, kind: 'magnet', magnet })
    }
    return entries
  }, [groups, magnets, preset?.tiles])

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
  const holdGroup = useMemo(
    () =>
      preset?.micHoldGroupId
        ? (groups.find((g) => g.id === preset.micHoldGroupId) ?? null)
        : null,
    [groups, preset?.micHoldGroupId],
  )

  /* ---------- 磁贴 ---------- */

  const handleFire = useCallback(
    (magnet: HotkeyMagnet) => {
      // ⚠️ 必须真的发给电脑 —— 原型里这里只弹了个 toast，什么都没发
      fireMagnet(magnet)
      showToast(`已发送 ${magnetDisplay(magnet)}`)
    },
    [fireMagnet, showToast],
  )

  const handleHoldStart = useCallback(
    (magnet: HotkeyMagnet) => {
      holdTileMagnet(magnet)
      // 文本磁片没有「按住」语义 —— 长按只是把它粘贴出来
      showToast(
        magnetIsText(magnet)
          ? `已发送 ${magnetDisplay(magnet)}`
          : `按住中 · ${magnetDisplay(magnet)}（松手松开）`,
      )
    },
    [holdTileMagnet, showToast],
  )

  const handleHoldEnd = useCallback(() => {
    releaseTileMagnet()
  }, [releaseTileMagnet])

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
                background: connected
                  ? 'var(--color-connected)'
                  : 'var(--color-text-tertiary)',
              }}
              aria-label={connected ? '已连接' : '未连接'}
            />
            <span
              className={
                connected
                  ? 'truncate text-[13px] font-medium text-text-primary'
                  : 'truncate text-[13px] font-medium text-text-tertiary'
              }
            >
              {pairedDevice?.name ?? (connected ? '已连接' : '未连接')}
            </span>
            <span className="tabular shrink-0 text-[11px] text-text-tertiary">
              {foregroundApp.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={onOpenPresets}
              aria-label="预案"
              className="grid size-11 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
            >
              <SlidersHorizontal size={17} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="设置"
              className="grid size-11 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
            >
              <Settings size={17} strokeWidth={1.7} />
            </button>
          </div>
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
        {!connected && (
          <button
            type="button"
            onClick={reconnect}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-border-subtle bg-surface-1 py-1.5 text-[11px] text-text-secondary active:scale-[0.99]"
          >
            <RefreshCw size={11} strokeWidth={1.8} />
            未连接电脑 · 点此重连
          </button>
        )}
      </header>



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
              onToggleContinuous={toggleContinuous}
              onPushToTalkStart={startPushToTalk}
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
            group={holdGroup}
            onClick={onEditMicBindings}
          />
        </div>
      </div>

      {/* ---------- 独立快捷键磁贴 ---------- */}
      <div className="shrink-0 px-4 pb-4">
        <TileGrid
          items={tileItems}
          onFire={handleFire}
          onUnbound={handleUnbound}
          onHoldStart={handleHoldStart}
          onHoldEnd={handleHoldEnd}
          onRunGroup={(group) => {
            runGroup(group)
            showToast(`执行「${group.name}」· ${group.steps.length} 步`)
          }}
          runningGroupId={runningGroupId}
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
            className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-8"
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


/** 一枚快捷键芯片：标签 + 等宽组合键 */
function HotkeyChip({
  label,
  magnet,
  group,
  onClick,
}: {
  label: string
  magnet: HotkeyMagnet | null
  /** 长按可以绑磁片组，这时显示组名和步数 */
  group?: MagnetGroup | null
  onClick: () => void
}) {
  const bound = !!group || magnetIsBound(magnet)
  const keys = group
    ? `组 · ${group.steps.length} 步`
    : bound
      ? magnetDisplay(magnet)
      : ''
  const groupName = group?.name

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`设置麦克风按钮${label}时触发的快捷键，当前 ${
        groupName ?? (bound ? keys : '未设置')
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
