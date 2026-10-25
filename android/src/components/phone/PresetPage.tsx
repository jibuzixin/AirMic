import { createElement } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Layers, ChevronRight, Plus, Unplug } from 'lucide-react'
import { DragToConfirm } from '@/components/ui/drag-to-confirm'
import { useAirmic } from '@/lib/airmic-store'
import { springSnappy } from '@/lib/motion'
import type { Preset } from '@/lib/airmic-data'
import { appIcon } from './icons'

/**
 * 手机端预案管理页
 * ------------------------------------------------------------
 * 需求说明书 §3.4：
 *   列出所有预案：名称 / 绑定应用 / 快捷键数量
 *   默认预案有明确标识
 *   新建 / 编辑 / 删除
 *
 * ⚠️ 编辑抽屉由 PhoneShell 统一挂载：
 *   这里只负责「点哪套预案 → 通知外层打开哪套的抽屉」。
 *   抽屉拿到的必须是 store 里的**实时对象** ——
 *   存对象快照的话，抽屉里改 store、界面显示旧快照 —— 点了没反应。
 */
export function PresetPage({
  onBack,
  onEditPreset,
}: {
  onBack: () => void
  onEditPreset: (presetId: string) => void
}) {
  const {
    presets,
    activePresetId,
    createPreset,
    disconnect,
    unpair,
    pairedDevice,
    themeMode,
    setThemeMode,
  } = useAirmic()

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
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
        {/* ---------- 预案列表 ---------- */}
        <ul className="flex flex-col gap-2">
          {presets.map((preset) => (
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
                    <AppLabel appIds={preset.appIds ?? []} appName={preset.appName} />
                    <span className="text-text-faint">·</span>
                    <span className="tabular">
                      麦克风 {countMicBindings(preset)} · 磁贴 {preset.tiles.length}
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

        {/* ---------- 新建 ---------- */}
        <button
          type="button"
          onClick={() => createPreset('新预案')}
          className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-subtle text-[12px] text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary"
        >
          <Plus size={14} strokeWidth={1.8} />
          新建预案
        </button>

        {/* ---------- 外观 ---------- */}
        <div className="mt-6">
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-3">
            <p className="text-[11px] text-text-tertiary">外观</p>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { id: 'system', label: '跟随系统' },
                  { id: 'light', label: '浅色' },
                  { id: 'dark', label: '深色' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setThemeMode(option.id)}
                  className={
                    themeMode === option.id
                      ? 'flex-1 rounded-[10px] border border-border-strong bg-surface-3 py-1.5 text-[12px] text-text-primary'
                      : 'flex-1 rounded-[10px] border border-border-subtle bg-surface-2 py-1.5 text-[12px] text-text-secondary'
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-text-faint">
              版本 0.2.0 · 构建 {__BUILD_TIME__}
            </p>
          </div>
        </div>

        {/* ---------- 连接管理 ---------- */}
        <div className="mt-auto pt-6">
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-3">
            <p className="text-[11px] text-text-tertiary">
              当前连接
              <span className="ml-1.5 text-text-secondary">
                {pairedDevice?.name ?? '未连接'}
              </span>
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={disconnect}
                className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-border-subtle text-[12px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              >
                <Unplug size={13} strokeWidth={1.8} />
                断开连接
              </button>

              <DragToConfirm
                label="拖动解绑设备"
                confirmedLabel="已解绑"
                actionType="delete"
                variant="danger"
                size="sm"
                onConfirm={unpair}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

function countMicBindings(preset: Preset): number {
  return (
    (preset.micPressId ? 1 : 0) +
    (preset.micReleaseId ? 1 : 0) +
    (preset.micHoldId ? 1 : 0)
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
    // id 通常是 bundle id，显示时取最后一段更可读
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
