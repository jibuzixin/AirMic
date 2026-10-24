import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import type { Device } from '@/lib/airmic-data'
import { springSmooth } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Collapse } from '@/components/Collapse'

/**
 * 折叠的「已配对设备」
 * ------------------------------------------------------------
 * 电脑端记住的（已配对）设备列表。删掉一台之后，
 * 那台手机下次打开必须重新走配对流程 —— 这正是 unpairDevice 的语义。
 *
 * 交互约束（需求）：
 *   - 默认折叠，常态不占空间（跟「详细设置」一致）
 *   - 删除是两段式确认：第一次点只进入待确认态，
 *     第二次点才真正删；点别处或 3 秒后自动还原
 *
 * 视觉约束（DESIGN.md）：
 *   - 本区块不使用琥珀色（琥珀色是稀缺资源，面板主按钮已经占用）
 *   - 删除是危险操作 → recording 红；连接状态 → connected 绿
 *   - 所有动效用 @/lib/motion 的 spring token，只动 transform / opacity
 */

/** 待确认态自动还原时间 */
const CONFIRM_TIMEOUT_MS = 3000
/** 操作结果提示停留时间 */
const NOTICE_TIMEOUT_MS = 4000

export function PairedDevices() {
  const { knownDevices, pairedDevice, paired, unpairDevice } = useAirmic()
  const [expanded, setExpanded] = useState(false)
  /** 正在等待二次确认的设备 id */
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<number | null>(null)

  /* ---------- 操作结果提示 ---------- */
  const showNotice = useCallback((message: string) => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
    }
    setNotice(message)
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null
      setNotice(null)
    }, NOTICE_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [])

  /* ---------- 待确认态：点别处还原 + 3 秒自动还原 ---------- */
  useEffect(() => {
    if (pendingId === null) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element) {
        const trigger = target.closest('[data-unpair-trigger]')
        // 点的就是当前待确认的那颗按钮 → 保留待确认态，交给 click 处理
        if (trigger?.getAttribute('data-unpair-trigger') === pendingId) return
      }
      setPendingId(null)
    }

    document.addEventListener('pointerdown', onPointerDown)
    const timer = window.setTimeout(() => setPendingId(null), CONFIRM_TIMEOUT_MS)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.clearTimeout(timer)
    }
  }, [pendingId])

  const handleDelete = (device: Device, isConnected: boolean) => {
    if (pendingId === device.id) {
      // 第二次点击 → 真正删除
      setPendingId(null)
      unpairDevice(device.id)
      showNotice(
        isConnected
          ? `已删除「${device.name}」的配对信息，连接已断开。这台手机下次打开需要重新配对。`
          : `已删除「${device.name}」的配对信息。这台手机下次打开需要重新配对。`,
      )
      return
    }
    // 第一次点击 → 只进入待确认态
    setPendingId(device.id)
  }

  const connectedId = paired ? (pairedDevice?.id ?? null) : null

  return (
    <section className="border-t border-border-subtle">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="airmic-paired-devices-body"
          className="flex w-full items-center justify-between rounded-[10px] px-1 py-3 text-[12px] text-text-secondary transition-colors duration-150 ease-spring-soft hover:bg-surface-2 hover:text-text-primary active:bg-surface-3"
        >
          <span>已配对设备</span>
          <motion.span
            aria-hidden
            className="flex items-center"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={springSmooth}
          >
            <ChevronDown size={14} strokeWidth={1.8} />
          </motion.span>
        </button>
      </h3>

      {/*
        展开用真实高度补间（Collapse），不用 framer-motion 的 layout ——
        layout 靠 scale 校正尺寸，会把标题行压扁。
      */}
      <Collapse open={expanded} className="pb-3">
        <div id="airmic-paired-devices-body">
            {knownDevices.length === 0 ? (
              <p className="px-1 text-[11px] text-text-tertiary">
                还没有配对过的设备。在手机上点设备名就能发起配对。
              </p>
            ) : (
              <>
                <ul className="m-0 list-none p-0">
                  {knownDevices.map((device) => {
                    const isConnected = connectedId === device.id
                    const isPending = pendingId === device.id

                    return (
                      <li
                        key={device.id}
                        className="flex items-center justify-between gap-2 border-t border-border-subtle py-2 first:border-t-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-text-primary">
                            {device.name}
                          </div>
                          <div className="mt-1 truncate text-[11px] text-text-tertiary">
                            {device.model}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {isConnected && (
                            <span className="flex items-center gap-1 rounded-full border border-border-subtle px-2 py-1 text-[11px] font-medium text-connected">
                              <span
                                aria-hidden
                                className="h-[6px] w-[6px] rounded-full bg-connected"
                              />
                              已连接
                            </span>
                          )}

                          <motion.button
                            type="button"
                            data-unpair-trigger={device.id}
                            onClick={() => handleDelete(device, isConnected)}
                            whileTap={{ scale: 0.96 }}
                            transition={springSmooth}
                            aria-label={
                              isPending
                                ? `确认删除 ${device.name} 的配对信息`
                                : `删除 ${device.name} 的配对信息`
                            }
                            className={cn(
                              'rounded-[10px] px-2 py-1 text-[12px] font-medium transition-colors duration-150 ease-spring-soft',
                              isPending
                                ? 'bg-surface-2 text-recording'
                                : 'text-text-tertiary hover:text-recording active:bg-surface-2 active:text-recording',
                            )}
                          >
                            {isPending ? '确认删除？' : '删除'}
                          </motion.button>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <p className="px-1 text-[11px] text-text-tertiary">
                  删除后这台手机下次打开需要重新配对。
                </p>
              </>
            )}

            <p
              aria-live="polite"
              className={cn(
                'px-1 text-[11px]',
                notice ? 'text-text-secondary' : 'text-text-faint',
              )}
            >
              {notice ?? ' '}
            </p>
        </div>
      </Collapse>
    </section>
  )
}
