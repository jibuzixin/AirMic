import { createElement, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { useBackHandler } from '@/lib/back-stack'
import { magnetHasKey, magnetKeys, type HotkeyMagnet } from '@/lib/hotkey'
import { tileIcon } from './icons'
import { MagnetEditor } from './MagnetEditor'

/**
 * 磁片库
 * ------------------------------------------------------------
 * 磁片是全局的：预案里的磁贴、麦克风按钮的按下/松开都引用它。
 * 磁片组在单独的「磁片组」页管理。
 */
export function MagnetLibraryPage({ onBack }: { onBack: () => void }) {
  useBackHandler(onBack)
  const { magnets, addMagnet, updateMagnet, deleteMagnet } = useAirmic()
  const [editing, setEditing] = useState<HotkeyMagnet | null | undefined>(
    undefined,
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回设置"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <ChevronLeft size={17} strokeWidth={1.8} />
        </button>
        <h1 className="text-[15px] font-semibold text-text-primary">磁片库</h1>
        <span className="text-[11px] text-text-tertiary">
          {magnets.length} 个
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setEditing(null)}
          aria-label="新建磁片"
          className="grid size-11 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <Plus size={17} strokeWidth={1.8} />
        </button>
      </header>

      <p className="px-4 pb-2 text-[11px] leading-relaxed text-text-tertiary">
        磁片 = 图标 + 名字 + 一组按键。预案里的磁贴、麦克风按钮的按下/松开都引用这里的磁片；改一次，所有用到它的地方一起变。
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {magnets.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="text-[12px] text-text-secondary">还没有磁片</p>
            <p className="mt-1 text-[11px] text-text-tertiary">
              点右上角的「+」新建一个
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {magnets.map((magnet) => (
              <li
                key={magnet.id}
                className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-text-secondary">
                  {createElement(tileIcon(magnet.icon), {
                    size: 15,
                    strokeWidth: 1.8,
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                  {magnet.label}
                </span>
                <span className="tabular shrink-0 text-[11px] text-text-tertiary">
                  {magnetHasKey(magnet) ? magnetKeys(magnet) : '未设置'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(magnet)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  编辑
                </button>
                <button
                  type="button"
                  aria-label={`删除磁片「${magnet.label}」`}
                  onClick={() => deleteMagnet(magnet.id)}
                  className="grid size-9 shrink-0 place-items-center rounded-[10px] text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {editing !== undefined && (
          <MagnetEditor
            key={editing?.id ?? 'new'}
            magnet={editing}
            onSave={(draftMagnet) => {
              if (editing) {
                updateMagnet(editing.id, draftMagnet)
              } else {
                addMagnet(draftMagnet)
              }
              setEditing(undefined)
            }}
            onClose={() => setEditing(undefined)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
