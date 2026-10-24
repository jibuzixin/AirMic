import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, RefreshCw, Wifi, Check, ChevronRight, Link2 } from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import type { Device } from '@/lib/airmic-data'
import { fadeFast, springSmooth, springSnappy } from '@/lib/motion'

/**
 * 手机端设备页
 * ------------------------------------------------------------
 * 需求说明书 §3.1 / §3.2：
 *   - **未配对 → 永远进这一页**
 *   - 手动刷新扫描，不持续轮询（省电，用户明确要求）
 *   - 两条配对路径：点设备发配对请求 / 手输 6 位配对码
 *   - 空状态要写清怎么操作
 *
 * 连接 vs 配对（动词保持一致，别混）：
 *   - 电脑端**已经记住**的设备（knownDevices）→ 点一下直接**连接**
 *   - 电脑端**没记住**的设备                  → 点一下发**配对请求**，等电脑确认
 *   只有电脑端删掉了配对信息，这台设备才需要重新配对。
 */
export function DevicePage() {
  const {
    devices,
    knownDevices,
    scanning,
    pairingRequest,
    startScan,
    requestPair,
    connectTo,
    pairByCode,
  } = useAirmic()

  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (codeOpen) codeRef.current?.focus()
  }, [codeOpen])

  const handleCode = () => {
    const result = pairByCode(code)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    setCode('')
    setCodeOpen(false)
  }

  /** 已配对 → 直接连上；未配对 → 发配对请求 */
  const handleDevice = (device: Device) => {
    if (knownDevices.some((d) => d.id === device.id)) {
      connectTo(device.id)
      return
    }
    requestPair(device.id)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pb-3 pt-4">
        <h1 className="text-[17px] font-semibold text-text-primary">选择设备</h1>
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          手机和电脑要连同一个 Wi-Fi
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {/* ---------- 手动刷新 ---------- */}
        <button
          type="button"
          onClick={startScan}
          disabled={scanning}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-1 text-[12px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-60"
        >
          {scanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              扫描中…
            </>
          ) : (
            <>
              <RefreshCw size={14} strokeWidth={1.8} />
              刷新设备
            </>
          )}
        </button>

        {/* ---------- 等待电脑确认（只有未配对设备才会走到这里） ---------- */}
        <AnimatePresence>
          {pairingRequest && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ ...springSmooth, opacity: fadeFast }}
              className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5"
            >
              <Loader2 size={13} className="animate-spin text-text-tertiary" />
              <span className="text-[11px] text-text-secondary">
                等待电脑确认配对请求…
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- 设备列表 ---------- */}
        {devices.length === 0 && !scanning ? (
          <EmptyState onScan={startScan} />
        ) : (
          <ul className="flex flex-col gap-2">
            {devices.map((device) => {
              const known = knownDevices.some((d) => d.id === device.id)
              return (
                <DeviceRow
                  key={device.id}
                  device={device}
                  known={known}
                  pending={pairingRequest?.deviceId === device.id}
                  onClick={() => handleDevice(device)}
                />
              )
            })}
          </ul>
        )}

        {/* ---------- 配对码路径 ---------- */}
        <div className="mt-auto pt-2">
          {!codeOpen ? (
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-border-subtle bg-surface-1 px-3 text-[12px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <span>输入电脑端配对码</span>
              <ChevronRight size={15} strokeWidth={1.7} />
            </button>
          ) : (
            <div className="rounded-xl border border-border-subtle bg-surface-1 p-3">
              <label
                htmlFor="pair-code"
                className="text-[11px] text-text-tertiary"
              >
                输入电脑上显示的 6 位配对码
              </label>
              <input
                id="pair-code"
                ref={codeRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setError(null)
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="······"
                className="tabular mt-1.5 w-full rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2 text-[16px] text-text-primary outline-none placeholder:text-text-faint focus:border-border-strong"
                style={{ letterSpacing: '0.2em' }}
              />
              {error && (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--color-recording)' }}>
                  {error}
                </p>
              )}
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleCode}
                  disabled={code.length !== 6}
                  className="flex h-11 flex-1 items-center justify-center rounded-[10px] bg-amber-accent text-[12px] font-medium text-surface-0 transition-opacity disabled:opacity-40"
                >
                  配对
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeOpen(false)
                    setCode('')
                    setError(null)
                  }}
                  className="flex h-11 items-center justify-center rounded-[10px] border border-border-subtle px-3 text-[12px] text-text-secondary transition-colors hover:bg-surface-2"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeviceRow({
  device,
  known,
  pending,
  onClick,
}: {
  device: Device
  /** 电脑端已经记住这台设备 → 点一下直接连接 */
  known: boolean
  pending: boolean
  onClick: () => void
}) {
  return (
    <li>
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.985 }}
        transition={springSnappy}
        className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-text-primary">
              {device.name}
            </span>
            {known && (
              <span
                className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px]"
                style={{
                  background: 'var(--color-connected-muted)',
                  color: 'var(--color-connected)',
                }}
              >
                <Check size={8} strokeWidth={3} />
                已配对
              </span>
            )}
          </div>
          <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">
            {device.model}
            <span className="text-text-faint"> · </span>
            {known ? '点一下直接连接' : '点一下请求配对'}
          </span>
        </div>

        {/* 信号强度 4 格 */}
        <div className="flex shrink-0 items-end gap-[2px]" aria-label={`信号强度 ${device.signal} 格`}>
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className="w-[3px] rounded-[1px]"
              style={{
                height: 4 + n * 2.5,
                background:
                  n <= device.signal
                    ? 'var(--color-text-tertiary)'
                    : 'var(--color-surface-3)',
              }}
            />
          ))}
        </div>

        {pending ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-text-tertiary" />
        ) : known ? (
          <Link2
            size={14}
            strokeWidth={1.7}
            className="shrink-0"
            style={{ color: 'var(--color-connected)' }}
          />
        ) : (
          <Wifi size={14} strokeWidth={1.7} className="shrink-0 text-text-faint" />
        )}
      </motion.button>
    </li>
  )
}

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle px-4 py-8 text-center">
      <Wifi size={20} strokeWidth={1.5} className="text-text-faint" />
      <p className="text-[12px] text-text-secondary">没扫到设备</p>
      <p className="max-w-[220px] text-[11px] leading-relaxed text-text-tertiary">
        确认电脑上的 AirMic 已经启动，并且手机和电脑在同一个 Wi-Fi 下
      </p>
      <button
        type="button"
        onClick={onScan}
        className="mt-1 flex h-11 items-center rounded-[10px] border border-border-subtle px-3 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
      >
        重新扫描
      </button>
    </div>
  )
}
