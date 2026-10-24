import { createElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import { fadeFast, springSmooth } from '@/lib/motion'
import { usePhoneOverlay } from './PhoneOverlay'
import { magnetHasKey, magnetKeys, type HotkeyMagnet } from '@/lib/hotkey'
import { tileIcon } from './icons'

/**
 * 选择一个已有的磁铁
 * ------------------------------------------------------------
 * 麦克风按钮的「按下 / 松开」从磁铁库里挑一个 —— 和磁贴用的是同一批磁铁。
 * 磁铁是全局的，所以这里列的是全部磁铁，不是当前预案专属的。
 */
export function MagnetPicker({
  magnets,
  onPick,
  onCreate,
  onClose,
}: {
  magnets: HotkeyMagnet[]
  /** null = 不绑定 */
  onPick: (magnetId: string | null) => void
  onCreate: () => void
  onClose: () => void
}) {
  const overlay = usePhoneOverlay()
  if (!overlay) return null

  return createPortal(
    <div className="pointer-events-auto absolute inset-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fadeFast}
        onClick={onClose}
        className="absolute inset-0 z-30"
        style={{ background: 'rgba(11, 11, 13, 0.7)' }}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={springSmooth}
        className="absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] flex-col rounded-t-2xl border-t border-border-subtle bg-surface-1"
      >
        <div className="flex cursor-grab touch-none flex-col items-center pt-2">
          <span className="h-1 w-9 rounded-full bg-surface-3" />
        </div>
        <div className="flex items-start justify-between px-4 pb-2 pt-3">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">
              选择磁铁
            </h2>
            <p className="mt-0.5 text-[10px] text-text-tertiary">
              磁铁是全局的 —— 磁贴和麦克风按钮共用同一批
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <ul className="flex flex-col gap-1.5">
            <li>
              <button
                type="button"
                onClick={() => onPick(null)}
                className="flex h-11 w-full items-center justify-between rounded-[10px] border border-border-subtle bg-surface-2 px-3 text-[12px] text-text-tertiary transition-colors hover:bg-surface-3"
              >
                <span>不绑定</span>
              </button>
            </li>
            {magnets.map((magnet) => {
              const Icon = tileIcon(magnet.icon)
              const hasKey = magnetHasKey(magnet)
              return (
                <li key={magnet.id}>
                  <button
                    type="button"
                    onClick={() => onPick(magnet.id)}
                    className="flex h-11 w-full items-center gap-2.5 rounded-[10px] border border-border-subtle bg-surface-2 px-3 text-left transition-colors hover:bg-surface-3"
                  >
                    {createElement(Icon, { size: 15, strokeWidth: 1.8 })}
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                      {magnet.label}
                    </span>
                    <span className="tabular text-[11px] text-text-tertiary">
                      {hasKey ? magnetKeys(magnet) : '未设置'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            onClick={onCreate}
            className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border-subtle text-[12px] text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary"
          >
            <Plus size={14} strokeWidth={1.8} />
            新建磁铁
          </button>
        </div>
      </motion.div>
    </div>,
    overlay,
  )
}

export { AnimatePresence }
