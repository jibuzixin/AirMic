import { createElement, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Layers,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { useBackHandler } from '@/lib/back-stack'
import { magnetHasKey, magnetKeys, type HotkeyMagnet } from '@/lib/hotkey'
import type { MagnetGroup } from '@/lib/airmic-data'
import { tileIcon } from './icons'
import { MagnetEditor } from './MagnetEditor'

/**
 * 磁片库
 * ------------------------------------------------------------
 * 磁片是**全局**的：预案里的磁贴、麦克风按钮的按下/松开都引用它。
 *
 * 这里还有「磁片组」：把几个磁片按顺序排好，点一下依次执行，
 * 每一步之间可以设置间隔秒数。
 */
export function MagnetLibraryPage({ onBack }: { onBack: () => void }) {
  useBackHandler(onBack)
  const {
    magnets,
    groups,
    addMagnet,
    updateMagnet,
    deleteMagnet,
    upsertGroup,
    deleteGroup,
    runGroup,
    runningGroupId,
  } = useAirmic()

  /** 正在编辑的磁片；null = 新建；undefined = 关闭 */
  const [editing, setEditing] = useState<HotkeyMagnet | null | undefined>(
    undefined,
  )
  /** 正在编辑的磁片组 */
  const [draft, setDraft] = useState<MagnetGroup | null>(null)

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
        <h1 className="text-[14px] font-medium text-text-primary">磁片库</h1>
        <span className="text-[11px] text-text-tertiary">
          {magnets.length} 个 · {groups.length} 组
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
        {/* ---------- 磁片 ---------- */}
        {magnets.length === 0 ? (
          <div className="mt-8 text-center">
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

        {/* ---------- 磁片组 ---------- */}
        <div className="mt-6 flex items-center justify-between">
          <div>
            <h2 className="text-[12px] font-medium text-text-primary">磁片组</h2>
            <p className="mt-0.5 text-[10px] text-text-tertiary">
              点一下，按顺序依次执行组里的磁片
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setDraft({
                id: `g-${Date.now().toString(36)}`,
                name: '新磁片组',
                icon: 'Layers',
                steps: [],
                intervalSeconds: 1,
              })
            }
            className="flex items-center gap-1 rounded-[10px] border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary active:scale-95"
          >
            <Plus size={12} strokeWidth={1.8} />
            新建
          </button>
        </div>

        {/* 编辑器 */}
        {draft && (
          <GroupEditor
            draft={draft}
            magnets={magnets}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => {
              upsertGroup(draft)
              setDraft(null)
            }}
          />
        )}

        {groups.length === 0 && !draft ? (
          <p className="mt-3 text-[11px] text-text-tertiary">还没有磁片组</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {groups.map((group) => (
              <li
                key={group.id}
                className={
                  runningGroupId === group.id
                    ? 'flex items-center gap-2 rounded-xl border border-[var(--color-amber-accent)] bg-surface-1 px-3 py-2.5'
                    : 'flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5'
                }
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-text-secondary">
                  {createElement(tileIcon(group.icon), {
                    size: 15,
                    strokeWidth: 1.8,
                  })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text-primary">
                    {group.name}
                  </span>
                  <span className="tabular block text-[10px] text-text-tertiary">
                    {group.steps.length} 步 · 间隔 {group.intervalSeconds}s
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => runGroup(group)}
                  aria-label={`执行磁片组「${group.name}」`}
                  className="grid size-9 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  <Play size={14} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(group)}
                  className="shrink-0 rounded-full px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  编辑
                </button>
                <button
                  type="button"
                  aria-label={`删除磁片组「${group.name}」`}
                  onClick={() => deleteGroup(group.id)}
                  className="grid size-9 shrink-0 place-items-center rounded-[10px] text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- 磁片编辑器 ---------- */}
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

/* ------------------------------------------------------------------ */

function GroupEditor({
  draft,
  magnets,
  onChange,
  onCancel,
  onSave,
}: {
  draft: MagnetGroup
  magnets: HotkeyMagnet[]
  onChange: (draft: MagnetGroup) => void
  onCancel: () => void
  onSave: () => void
}) {
  const steps = draft.steps
    .map((id) => magnets.find((m) => m.id === id))
    .filter((m): m is HotkeyMagnet => m !== undefined)
  const available = magnets.filter((m) => !draft.steps.includes(m.id))

  const move = (index: number, delta: number) => {
    const next = [...draft.steps]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const current = next[index]
    next[index] = next[target]
    next[target] = current
    onChange({ ...draft, steps: next })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 rounded-xl border border-border-strong bg-surface-1 p-3"
    >
      <div className="flex items-center gap-2">
        <Layers size={14} strokeWidth={1.8} className="text-text-secondary" />
        <input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          aria-label="磁片组名称"
          className="min-w-0 flex-1 rounded-[10px] border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-[12px] text-text-primary outline-none focus:border-border-strong"
        />
        <button
          type="button"
          onClick={onCancel}
          aria-label="取消"
          className="grid size-8 place-items-center rounded-[10px] text-text-tertiary"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/* 间隔 */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] text-text-secondary">每步间隔</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="减少间隔"
            onClick={() =>
              onChange({
                ...draft,
                intervalSeconds: Math.max(0.5, draft.intervalSeconds - 0.5),
              })
            }
            className="grid size-7 place-items-center rounded-[8px] border border-border-subtle text-[13px] text-text-secondary active:scale-95"
          >
            −
          </button>
          <span className="tabular w-10 text-center text-[11px] text-text-primary">
            {draft.intervalSeconds}s
          </span>
          <button
            type="button"
            aria-label="增加间隔"
            onClick={() =>
              onChange({
                ...draft,
                intervalSeconds: Math.min(10, draft.intervalSeconds + 0.5),
              })
            }
            className="grid size-7 place-items-center rounded-[8px] border border-border-subtle text-[13px] text-text-secondary active:scale-95"
          >
            +
          </button>
        </div>
      </div>

      {/* 步骤 */}
      <p className="mt-3 text-[10px] text-text-tertiary">执行顺序</p>
      {steps.length === 0 ? (
        <p className="mt-1 text-[11px] text-text-tertiary">
          还没有步骤 —— 从下面挑磁片
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {steps.map((magnet, index) => (
            <li
              key={magnet.id}
              className="flex items-center gap-1.5 rounded-[10px] bg-surface-2 px-2 py-1.5"
            >
              <span className="tabular w-4 text-[10px] text-text-faint">
                {index + 1}
              </span>
              {createElement(tileIcon(magnet.icon), {
                size: 13,
                strokeWidth: 1.8,
                className: 'text-text-secondary',
              })}
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-primary">
                {magnet.label}
              </span>
              <button
                type="button"
                aria-label="上移"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="grid size-6 place-items-center rounded text-text-tertiary disabled:opacity-30"
              >
                <ArrowUp size={11} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="下移"
                onClick={() => move(index, 1)}
                disabled={index === steps.length - 1}
                className="grid size-6 place-items-center rounded text-text-tertiary disabled:opacity-30"
              >
                <ArrowDown size={11} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label={`移除 ${magnet.label}`}
                onClick={() =>
                  onChange({
                    ...draft,
                    steps: draft.steps.filter((id) => id !== magnet.id),
                  })
                }
                className="grid size-6 place-items-center rounded text-text-tertiary"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 可选磁片 */}
      {available.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {available.map((magnet) => (
            <button
              key={magnet.id}
              type="button"
              onClick={() =>
                onChange({ ...draft, steps: [...draft.steps, magnet.id] })
              }
              className="flex items-center gap-1 rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-[11px] text-text-secondary active:scale-95"
            >
              <Plus size={10} strokeWidth={2} />
              {magnet.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={draft.name.trim().length === 0 || draft.steps.length === 0}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-[10px] bg-amber-accent text-[12px] font-medium text-surface-0 disabled:opacity-40"
      >
        保存磁片组
      </button>
    </motion.div>
  )
}
