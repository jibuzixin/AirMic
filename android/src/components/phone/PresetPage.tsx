import { createElement, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { useBackHandler } from '@/lib/back-stack'
import { springSnappy } from '@/lib/motion'
import type { Preset } from '@/lib/airmic-data'
import { appIcon } from './icons'

/**
 * 手机端预案管理页
 * ------------------------------------------------------------
 * 这一页只放「预案」：列表 + 搜索 + 新建。
 * 磁片库、磁片组、省电、外观、连接管理都移到设置页。
 *
 * ⚠️ 编辑抽屉由 PhoneShell 统一挂载：
 *   这里只负责「点哪套预案 → 通知外层打开哪套的抽屉」。
 */
export function PresetPage({
  onBack,
  onEditPreset,
  onOpenSettings,
}: {
  onBack: () => void
  onEditPreset: (presetId: string) => void
  onOpenSettings: () => void
}) {
  useBackHandler(onBack)

  const { presets, activePresetId, createPreset } = useAirmic()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return presets
    return presets.filter((preset) => {
      if (preset.name.toLowerCase().includes(keyword)) return true
      return (preset.appIds ?? []).some((id) =>
        id.toLowerCase().includes(keyword),
      )
    })
  }, [presets, query])

  return (
    <div className="flex h-full flex-col">
      {/* ---------- 顶栏 ---------- */}
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回麦克风页"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <ChevronLeft size={17} strokeWidth={1.8} />
        </button>
        <h1 className="text-[15px] font-semibold text-text-primary">预案</h1>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="设置"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <Settings size={16} strokeWidth={1.8} />
        </button>
      </header>

      {/* ---------- 搜索 ---------- */}
      <div className="shrink-0 px-4 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-1 px-2.5">
          <Search size={13} strokeWidth={1.8} className="text-text-tertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索预案或应用"
            aria-label="搜索预案"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="清除搜索"
              className="grid size-6 place-items-center rounded-full text-text-tertiary"
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
        {/* ---------- 预案列表 ---------- */}
        {filtered.length === 0 ? (
          <p className="mt-8 text-center text-[12px] text-text-tertiary">
            {query ? '没有匹配的预案' : '还没有预案'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((preset) => (
              <li key={preset.id}>
                <motion.button
                  type="button"
                  onClick={() => onEditPreset(preset.id)}
                  whileTap={{ scale: 0.985 }}
                  transition={springSnappy}
                  className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-text-primary">
                        {preset.name}
                      </span>
                      {preset.isDefault && (
                        <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] text-text-tertiary">
                          默认
                        </span>
                      )}
                      {preset.id === activePresetId && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px]"
                          style={{
                            background: 'var(--color-amber-accent-muted)',
                            color: 'var(--color-amber-accent)',
                          }}
                        >
                          使用中
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-tertiary">
                      <AppLabel
                        appIds={preset.appIds ?? []}
                        appName={preset.appName}
                      />
                      <span className="text-text-faint">·</span>
                      <span className="tabular">
                        麦克风 {countMicBindings(preset)} · 磁贴{' '}
                        {preset.tiles.length}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={15}
                    strokeWidth={1.7}
                    className="shrink-0 text-text-faint"
                  />
                </motion.button>
              </li>
            ))}
          </ul>
        )}

        {/* ---------- 新建 ---------- */}
        <button
          type="button"
          onClick={() => createPreset('新预案')}
          className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-subtle text-[12px] text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary"
        >
          <Plus size={14} strokeWidth={1.8} />
          新建预案
        </button>
      </div>
    </div>
  )
}

function countMicBindings(preset: Preset): number {
  return (
    (preset.micPressId ? 1 : 0) +
    (preset.micReleaseId ? 1 : 0) +
    (preset.micHoldId || preset.micHoldGroupId ? 1 : 0)
  )
}

function AppLabel({
  appIds,
  appName,
}: {
  appIds: string[]
  appName: string | null
}) {
  const count = appIds.length
  if (count > 1) {
    return (
      <span className="flex items-center gap-1 text-text-secondary">
        <Layers size={11} strokeWidth={1.8} />
        已绑定 {count} 个应用
      </span>
    )
  }
  if (count === 1) {
    const id = appIds[0]
    const label = appName || id.split('.').pop() || id
    return (
      <span className="flex items-center gap-1 text-text-secondary">
        {createElement(appIcon(label), { size: 11, strokeWidth: 1.8 })}
        {label}
      </span>
    )
  }
  if (!appName) {
    return <span className="text-text-tertiary">未绑定应用</span>
  }
  return (
    <span className="flex items-center gap-1 text-text-tertiary">
      {createElement(appIcon(appName), { size: 11, strokeWidth: 1.8 })}
      {appName}
    </span>
  )
}
