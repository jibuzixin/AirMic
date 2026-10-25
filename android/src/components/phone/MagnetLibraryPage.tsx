import { createElement, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { magnetHasKey, magnetKeys, type HotkeyMagnet } from '@/lib/hotkey'
import { tileIcon } from './icons'
import { MagnetEditor } from './MagnetEditor'

/**
 * 磁铁库
 * ------------------------------------------------------------
 * 磁铁是**全局**的：预案里的磁贴、麦克风按钮的按下/松开都引用它。
 *
 * 单独一页管理（新建 / 编辑 / 删除），预案编辑器里只负责「引用」，
 * 这样每个页面各司其职，不会把预案编辑塞得很乱。
 */
export function MagnetLibraryPage({ onBack }: { onBack: () => void }) {
  const { magnets, addMagnet, updateMagnet, deleteMagnet } = useAirmic()
  /** 正在编辑的磁铁；null = 新建；undefined = 关闭 */
  const [editing, setEditing] = useState<HotkeyMagnet | null | undefined>(
    undefined,
  )

  return (
    <div className="flex h-full flex-col">
      {/* ---------- 顶栏 ---------- */}
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回预案"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <ChevronLeft size={17} strokeWidth={1.8} />
        </button>
        <h1 className="text-[14px] font-medium text-text-primary">磁铁库</h1>
        <span className="text-[11px] text-text-tertiary">
          {magnets.length} 个
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setEditing(null)}
          aria-label="新建磁铁"
          className="grid size-11 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <Plus size={17} strokeWidth={1.8} />
        </button>
      </header>

      <p className="px-4 pb-2 text-[11px] leading-relaxed text-text-tertiary">
        磁铁 = 图标 + 名字 + 一组按键。预案里的磁贴、麦克风按钮的按下/松开都引用这里的磁铁；改一次，所有用到它的地方一起变。
      </p>

      {/* ---------- 列表 ---------- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {magnets.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="text-[12px] text-text-secondary">还没有磁铁</p>
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
                  aria-label={`删除磁铁「${magnet.label}」`}
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

      {/* ---------- 编辑器 ---------- */}
      <AnimatePresence>
        {editing !== undefined && (
          <MagnetEditor
            key={editing?.id ?? 'new'}
            magnet={editing}
            onSave={(draft) => {
              if (editing) {
                updateMagnet(editing.id, draft)
              } else {
                addMagnet(draft)
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
