import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { OUTPUT_DEVICES, useAirmic } from '@/lib/airmic-store'
import { cn } from '@/lib/utils'
import { SPRING_SMOOTH } from './mac-motion'

/**
 * 音频输出设备下拉（需求说明书 §2.1 第 3 项）
 * ------------------------------------------------------------
 * 虚拟设备（BlackHole 等）带一个「虚拟」小徽章。
 * 用自绘 listbox 而不是原生 select —— 原生 option 放不下徽章。
 * 弹层绝对定位，展开动画只动 transform / opacity。
 */
export function OutputDevicePicker() {
  const { outputDeviceId, setOutputDevice } = useAirmic()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 点外部关闭 + Esc 关闭
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current =
    OUTPUT_DEVICES.find((d) => d.id === outputDeviceId) ?? OUTPUT_DEVICES[0]

  return (
    <div ref={wrapRef} className="relative border-t border-border-subtle py-3">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[12px] text-text-secondary">音频输出</span>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`音频输出设备，当前 ${current?.name ?? '未选择'}`}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-surface-2 px-2 py-2 text-left transition-colors duration-150 ease-spring-soft hover:border-border-strong hover:bg-surface-3 active:bg-surface-3"
        >
          <span className="min-w-0 truncate text-[12px] text-text-primary">
            {current?.name ?? '未选择'}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.8}
            aria-hidden
            className="shrink-0 text-text-tertiary"
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key="output-list"
            role="listbox"
            aria-label="音频输出设备"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={SPRING_SMOOTH}
            style={{ originY: 0 }}
            className="absolute right-3 z-20 mt-1 min-w-[190px] overflow-hidden rounded-[10px] border border-border-strong bg-surface-2 py-1"
          >
            {OUTPUT_DEVICES.map((device) => {
              const selected = device.id === outputDeviceId
              return (
                <li key={device.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setOutputDevice(device.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-2 py-2 text-left transition-colors duration-150 ease-spring-soft',
                      selected
                        ? 'bg-surface-3 text-text-primary'
                        : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[12px]">{device.name}</span>
                      {device.virtual && (
                        <span className="shrink-0 rounded-full border border-border-subtle px-2 py-1 text-[10px] text-text-tertiary">
                          虚拟
                        </span>
                      )}
                    </span>
                    {selected && (
                      <Check
                        size={13}
                        strokeWidth={2}
                        aria-hidden
                        className="shrink-0 text-text-secondary"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
