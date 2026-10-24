import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { cn } from '@/lib/utils'
import { PairingRequestCard } from './PairingRequestCard'
import { OutputDevicePicker } from './OutputDevicePicker'
import { AdvancedSettings } from './AdvancedSettings'
import { PairedDevices } from './PairedDevices'
import { fadeFast, springSmooth, springSnappy } from '@/lib/motion'
import { SPRING_SNAPPY } from './mac-motion'

/**
 * 电脑端菜单栏面板（需求说明书 §2.1 / DESIGN.md §7.1）
 * ------------------------------------------------------------
 * 固定宽 318px，纵向顺序不可变：
 *   1. 状态行（连接状态 + 设备名 + 当前前台应用）
 *   2. 配对码（未连接时才显示）
 *   3. 音频输出设备下拉
 *   4. 开始 / 停止收音 主按钮（唯一的主操作）
 *   5. 折叠的「详细设置」（统计 + 抖动缓冲 + 1kHz 测试音）
 *   6. 折叠的「已配对设备」（管理已配对设备，可删除配对信息）
 *   7. 退出 AirMic
 *
 * 「已配对设备」是管理性内容，排在折叠区末尾、退出之前，
 * 不打断上面六段的主流程顺序。
 *
 * 配对请求提示插在状态行上方（它是"来活了"，不属于常规结构）。
 */
export function MacPanel({ className }: { className?: string } = {}) {
  const { paired, serverRunning, pairingRequest, toggleServer } = useAirmic()

  /**
   * 琥珀色是稀缺资源（DESIGN.md §3.3）：
   * 一个视图里最多一处主操作。
   *   - 配对请求在场 → 「允许」是此刻唯一的主操作
   *   - 否则 → 「开始收音」是唯一的主操作
   * 「停止收音」按需求始终用次要样式，不用琥珀色。
   */
  const amberPrimary = paired && !serverRunning && pairingRequest === null

  return (
    <div
      role="group"
      aria-label="AirMic 菜单栏面板"
      className={cn(
        'vibrancy scheme-dark w-[318px] rounded-[12px] border border-border-subtle text-text-primary',
        className,
      )}
    >
      <div className="flex flex-col p-3">
        <PairingRequestCard />

        <StatusRow />

        {!paired && <PairCodeRow />}

        <OutputDevicePicker />

        <div className="pb-3">
          <motion.button
            type="button"
            onClick={toggleServer}
            disabled={!paired}
            whileTap={paired ? { scale: 0.98 } : undefined}
            transition={SPRING_SNAPPY}
            className={cn(
              'w-full rounded-[12px] py-2 text-[13px] font-semibold transition-colors duration-150 ease-spring-soft',
              amberPrimary
                ? 'bg-amber-accent text-surface-0 hover:bg-amber-accent-hover active:bg-amber-accent-muted'
                : 'border border-border-strong bg-surface-2 text-text-primary hover:bg-surface-3 active:bg-surface-3',
              !paired && 'cursor-not-allowed opacity-50 hover:bg-surface-2',
            )}
          >
            {serverRunning ? '停止收音' : '开始收音'}
          </motion.button>

          {!paired && (
            <p className="mt-2 text-[11px] text-text-tertiary">
              还没有连上设备，先用配对码连一台手机
            </p>
          )}
        </div>

        <AdvancedSettings />

        <PairedDevices />

        <QuitRow />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. 状态行                                                          */
/* ------------------------------------------------------------------ */

function StatusRow() {
  const { paired, pairedDevice, foregroundApp } = useAirmic()

  return (
    <div className="pb-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-[8px] w-[8px] shrink-0 rounded-full"
          style={{
            background: paired
              ? 'var(--color-connected)'
              : 'var(--color-text-tertiary)',
          }}
        />
        <span className="text-[12px] text-text-secondary">
          {paired ? '已连接' : '未连接'}
        </span>
        <span className="text-[12px] text-text-tertiary">·</span>
        <span className="truncate text-[13px] font-medium text-text-primary">
          {pairedDevice?.name ?? '还没有设备'}
        </span>
      </div>
      <div className="mt-1 pl-4 text-[12px] text-text-secondary">
        当前应用：{foregroundApp.name}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2. 配对码（未连接时才显示）                                          */
/* ------------------------------------------------------------------ */

function PairCodeRow() {
  const { pairCode, refreshPairCode } = useAirmic()
  /** 每次点刷新换一个新 key，让图标重新转一圈 */
  const [spin, setSpin] = useState(0)

  return (
    <div className="border-t border-border-subtle py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-[12px] text-text-secondary">配对码</span>
        <div className="flex min-w-0 items-center gap-2">
          {/*
           * 配对码换了新值 → key 变 → 重新挂载 → 淡入动画重放。
           * 用 key 而不是改 opacity，是因为数字直接换字最干脆，
           * 不需要先淡出再淡入。
           */}
          <motion.span
            key={pairCode}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeFast}
            className="tabular truncate text-[15px] leading-none text-text-primary"
            style={{ letterSpacing: '0.2em' }}
            aria-label={`配对码 ${pairCode}`}
          >
            {pairCode}
          </motion.span>
          <motion.button
            type="button"
            onClick={() => {
              setSpin((s) => s + 1)
              refreshPairCode()
            }}
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            aria-label="刷新配对码"
            title="刷新配对码（旧码立即失效）"
            className="flex shrink-0 items-center gap-1 rounded-[10px] border border-border-subtle px-2 py-1 text-[11px] text-text-secondary transition-colors duration-150 ease-spring-soft hover:border-border-strong hover:bg-surface-2 hover:text-text-primary active:bg-surface-3"
          >
            <motion.span
              key={spin}
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={springSmooth}
              className="flex"
            >
              <RefreshCw size={12} strokeWidth={1.8} aria-hidden />
            </motion.span>
            <span>刷新</span>
          </motion.button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-text-tertiary">
        在手机端「输入配对码」里填这 6 位数字
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 7. 退出                                                             */
/* ------------------------------------------------------------------ */

function QuitRow() {
  const [hint, setHint] = useState(false)

  return (
    <div className="border-t border-border-subtle pt-1">
      <button
        type="button"
        onClick={() => setHint(true)}
        className="w-full rounded-[10px] px-1 py-2 text-left text-[12px] text-text-secondary transition-colors duration-150 ease-spring-soft hover:bg-surface-2 hover:text-text-primary active:bg-surface-3"
      >
        退出 AirMic
      </button>
      <AnimatePresence initial={false}>
        {hint && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ opacity: fadeFast, default: springSmooth }}
            className="pb-2 text-[11px] text-text-tertiary"
          >
            原型环境不执行退出，正式版会退出菜单栏常驻进程
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
