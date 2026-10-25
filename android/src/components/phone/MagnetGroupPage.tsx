import { createElement, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Boxes,
  Play,
  Search,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { useBackHandler } from '@/lib/back-stack'
import { magnetDisplay, type HotkeyMagnet } from '@/lib/hotkey'
import type { MagnetGroup } from '@/lib/airmic-data'
import { tileIcon } from './icons'

/**
 * 磁片组
 * ------------------------------------------------------------
 * 把几个磁片按顺序排好，点一下依次执行；每步之间可设置间隔。
 * 磁片组也会出现在「添加磁贴」的选择器里，可以放到预案的磁贴格子上。
 */
export function MagnetGroupPage({ onBack }: { onBack: () => void }) {
  useBackHandler(onBack)
  const {
    magnets,
    groups,
    upsertGroup,
    deleteGroup,
    runGroup,
    runningGroupId,
  } = useAirmic()

  const [draft, setDraft] = useState<MagnetGroup | null>(null)

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
        <h1 className="text-[15px] font-semibold text-text-primary">磁片组</h1>
        <span className="text-[11px] text-text-tertiary">{groups.length} 组</span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="新建磁片组"
          onClick={() =>
            setDraft({
              id: `g-${Date.now().toString(36)}`,
              name: '新磁片组',
              icon: 'Boxes',
              steps: [],
              intervalSeconds: 1,
            })
          }
          className="grid size-11 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <Plus size={17} strokeWidth={1.8} />
        </button>
      </header>

      <p className="px-4 pb-2 text-[11px] leading-relaxed text-text-tertiary">
        点一下 ▶ 按顺序依次执行组里的磁片；每一步之间等设定的间隔。
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {/* 新建：编辑区放在列表最上面（还没有对应的行） */}
        {draft && !groups.some((group) => group.id === draft.id) && (
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
          <div className="mt-10 text-center">
            <p className="text-[12px] text-text-secondary">还没有磁片组</p>
            <p className="mt-1 text-[11px] text-text-tertiary">
              点右上角的「+」把几个磁片串起来
            </p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {groups.map((group) =>
              draft?.id === group.id ? (
                // 编辑**在原位置展开**，不跳到最上面
                <li key={group.id}>
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
                </li>
              ) : (
                <li
                  key={group.id}
                  className={
                    runningGroupId === group.id
                      ? 'flex items-center gap-2 rounded-xl border border-[var(--color-amber-accent)] bg-surface-1 px-3 py-2.5'
                      : 'flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5'
                  }
                >
                  {/* 点整行进入编辑 */}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...group })}
                    aria-label={`编辑磁片组「${group.name}」`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
                  </button>
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
                    aria-label={`删除磁片组「${group.name}」`}
                    onClick={() => deleteGroup(group.id)}
                    className="grid size-9 shrink-0 place-items-center rounded-[10px] text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
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
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // 原地展开时可能落在可视区外，轻轻滚到可见位置
  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  /** 保留空位（找不到的磁片）以维持索引与 draft.steps 对齐 */
  const steps = draft.steps.map((id) => magnets.find((m) => m.id === id))
  const keyword = query.trim().toLowerCase()
  const candidates = keyword
    ? magnets.filter((m) => m.label.toLowerCase().includes(keyword))
    : magnets

  const addStep = (magnetId: string) => {
    // 允许重复：同一个磁片可以连着放好几次（比如连按几次撤销）
    onChange({ ...draft, steps: [...draft.steps, magnetId] })
  }

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
      ref={containerRef}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-1.5 rounded-xl border border-border-strong bg-surface-1 p-3"
    >
      <div className="flex items-center gap-2">
        <Boxes size={14} strokeWidth={1.8} className="text-text-secondary" />
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

      <p className="mt-3 text-[10px] text-text-tertiary">执行顺序</p>
      {steps.length === 0 ? (
        <p className="mt-1 text-[11px] text-text-tertiary">
          还没有步骤 —— 从下面挑磁片
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {steps.map((magnet, index) =>
            !magnet ? null : (
            <li
              key={`${magnet.id}-${index}`}
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
                aria-label={`移除第 ${index + 1} 步`}
                onClick={() =>
                  onChange({
                    ...draft,
                    steps: draft.steps.filter((_, i) => i !== index),
                  })
                }
                className="grid size-6 place-items-center rounded text-text-tertiary"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </li>
            ),
          )}
        </ul>
      )}

      {/* 可选磁片：可搜索、可重复添加 */}
      <div className="mt-2.5">
        <div className="flex h-8 items-center gap-1.5 rounded-[10px] border border-border-subtle bg-surface-2 px-2.5">
          <Search size={12} strokeWidth={1.8} className="text-text-tertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索磁片，点一下加入"
            aria-label="搜索磁片"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-text-primary outline-none placeholder:text-text-faint"
          />
        </div>
        <div className="mt-1.5 max-h-[180px] overflow-y-auto rounded-[10px] border border-border-subtle bg-surface-2">
          {candidates.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-text-tertiary">
              没有匹配的磁片
            </p>
          ) : (
            candidates.map((magnet) => (
              <button
                key={magnet.id}
                type="button"
                onClick={() => addStep(magnet.id)}
                className="flex h-9 w-full items-center gap-2 border-b border-border-subtle px-2.5 text-left last:border-b-0 active:bg-surface-3"
              >
                {createElement(tileIcon(magnet.icon), {
                  size: 13,
                  strokeWidth: 1.8,
                  className: 'text-text-secondary',
                })}
                <span className="min-w-0 flex-1 truncate text-[11px] text-text-primary">
                  {magnet.label}
                </span>
                <span className="tabular text-[10px] text-text-tertiary">
                  {magnetDisplay(magnet)}
                </span>
                <Plus size={12} strokeWidth={2} className="text-text-tertiary" />
              </button>
            ))
          )}
        </div>
        <p className="mt-1 text-[10px] text-text-faint">
          可以重复添加同一个磁片（比如连续撤销几次）。
        </p>
      </div>

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
