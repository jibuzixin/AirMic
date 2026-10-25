import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createElement } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Preset } from '@/lib/airmic-data'
import { useAirmic } from '@/lib/airmic-store'
import { useBackHandler } from '@/lib/back-stack'
import { fadeFast, layoutSpring, springSmooth } from '@/lib/motion'
import {
  magnetHasKey,
  magnetKeys,
  type HotkeyMagnet,
} from '@/lib/hotkey'
import { Collapse } from '@/components/Collapse'
import { appIcon, tileIcon } from './icons'
import { MagnetEditor } from './MagnetEditor'
import { MagnetPicker } from './MagnetPicker'

/**
 * 预案编辑抽屉
 * ------------------------------------------------------------
 * 需求说明书 §4.1 强调的一点，这里必须表达清楚：
 *   ① 麦克风按钮「按下」「松开」各执行一个**磁片**
 *   ② 独立快捷键磁贴（不与麦克风绑定）
 *   两者是**两处不同的绑定**，UI 上分成两个独立区块，不能混为一谈。
 *
 * 磁片是全局的：图标 + 名字 + 按键组合，磁贴和麦克风按钮共用同一批。
 *
 * ⚠️ 抽屉拿到的必须是 store 里的**实时对象** ——
 *   存对象快照的话，这里改 store、界面显示旧快照 —— 点了没反应。
 */

/** 这层弹层要作用到哪个位置 */
type PickerTarget =
  | { kind: 'micPress' }
  | { kind: 'micRelease' }
  | { kind: 'micHold' }
  | { kind: 'tile'; tileId: string }
  | { kind: 'addTile' }

export function PresetEditor({
  preset,
  onClose,
}: {
  preset: Preset
  onClose: () => void
}) {
  useBackHandler(onClose, { priority: 10 })

  const {
    magnets,
    groups,
    appList,
    currentApp,
    fetchAppList,
    fetchCurrentApp,
    updatePreset,
    deletePreset,
    addMagnet,
    updateMagnet,
    deleteMagnet,
  } = useAirmic()

  /** 正在挑磁片 */
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  /** 正在新建 / 编辑磁片；applyTo = 保存后应用到哪个位置 */
  const [magnetDraft, setMagnetDraft] = useState<{
    magnet: HotkeyMagnet | null
    applyTo: PickerTarget | null
  } | null>(null)

  const magnetOf = (id: string | null) =>
    id ? (magnets.find((m) => m.id === id) ?? null) : null

  /** 把一个磁片绑定到目标位置 */
  const applyMagnet = (target: PickerTarget, magnetId: string | null) => {
    if (target.kind === 'micPress') {
      updatePreset(preset.id, { micPressId: magnetId })
    } else if (target.kind === 'micRelease') {
      updatePreset(preset.id, { micReleaseId: magnetId })
    } else if (target.kind === 'micHold') {
      updatePreset(preset.id, { micHoldId: magnetId })
    } else if (target.kind === 'tile') {
      updatePreset(preset.id, {
        tiles: preset.tiles.map((t) =>
          t.id === target.tileId
            ? { ...t, magnetId: magnetId ?? undefined, groupId: undefined }
            : t,
        ),
      })
    } else if (target.kind === 'addTile' && magnetId) {
      updatePreset(preset.id, {
        tiles: [
          ...preset.tiles,
          { id: `t-${Date.now().toString(36)}`, magnetId },
        ],
      })
    }
    setPicker(null)
  }

  /** 把磁片组绑到磁贴位置 */
  const applyGroup = (target: PickerTarget, groupId: string) => {
    if (target.kind === 'tile') {
      updatePreset(preset.id, {
        tiles: preset.tiles.map((t) =>
          t.id === target.tileId
            ? { ...t, groupId, magnetId: undefined }
            : t,
        ),
      })
    } else if (target.kind === 'addTile') {
      updatePreset(preset.id, {
        tiles: [
          ...preset.tiles,
          { id: `t-${Date.now().toString(36)}`, groupId },
        ],
      })
    }
    setPicker(null)
  }

  /** 保存磁片 */
  const saveMagnet = (draft: Omit<HotkeyMagnet, 'id'>) => {
    if (magnetDraft?.magnet) {
      updateMagnet(magnetDraft.magnet.id, draft)
      setMagnetDraft(null)
      return
    }
    const id = addMagnet(draft)
    setMagnetDraft(null)
    // 新建的磁片直接应用到发起它的地方
    if (magnetDraft?.applyTo) applyMagnet(magnetDraft.applyTo, id)
  }

  const pressMagnet = magnetOf(preset.micPressId)
  const releaseMagnet = magnetOf(preset.micReleaseId)
  const holdMagnet = magnetOf(preset.micHoldId ?? null)
  const boundAppIds = preset.appIds ?? []
  /** appId → 显示名（bundle id 取最后一段兜底） */
  const appNameFor = (id: string) =>
    appList.find((app) => app.id === id)?.name ||
    (currentApp?.id === id ? currentApp.name : '') ||
    id.split('.').pop() ||
    id

  return (
    /*
     * 抽屉和磁片选择器 / 磁片编辑器是同一套交互：
     *   1. 从**下往上**滑出（spring，只动 transform）
     *   2. 后面一层半透明遮罩，点空白处退出
     * 之前这个抽屉是直接渲染的、没有遮罩也没有动画，
     * 跟二级弹层的交互对不上 —— 这一轮统一。
     */
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fadeFast}
        onClick={onClose}
        aria-hidden
        className="absolute inset-0 z-10"
        style={{ background: 'rgba(11, 11, 13, 0.55)' }}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={springSmooth}
        className="absolute inset-x-0 bottom-0 z-20 flex max-h-[86%] flex-col rounded-t-2xl border-t border-border-subtle bg-surface-1"
      >
        <div className="flex cursor-grab touch-none flex-col items-center pt-2">
          <span className="h-1 w-9 rounded-full bg-surface-3" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-2">
          <h2 className="text-[15px] font-semibold text-text-primary">编辑预案</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-7 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          {/* ---------- 预案名称 ---------- */}
          <Section title="预案名称">
            <input
              value={preset.name}
              onChange={(e) =>
                updatePreset(preset.id, { name: e.target.value })
              }
              aria-label="预案名称"
              className="w-full rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2 text-[13px] text-text-primary outline-none focus:border-border-strong"
            />
          </Section>

          {/* ---------- 绑定应用（可多选） ---------- */}
          <Section
            title="绑定电脑应用"
            hint="可以绑多个应用；一个应用只会属于一套预案"
          >
            {/* 已绑定的应用：能看见、能删 */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {boundAppIds.length === 0 ? (
                  <span className="text-[11px] text-text-tertiary">
                    还没有绑定应用
                  </span>
                ) : (
                  boundAppIds.map((id) => (
                    <span
                      key={id}
                      className="flex items-center gap-1 rounded-full border border-border-strong bg-surface-3 py-1 pl-2.5 pr-1 text-[11px] text-text-primary"
                    >
                      {appNameFor(id)}
                      <button
                        type="button"
                        aria-label={`取消绑定 ${appNameFor(id)}`}
                        onClick={() =>
                          updatePreset(preset.id, {
                            appIds: boundAppIds.filter((item) => item !== id),
                          })
                        }
                        className="grid size-5 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                      >
                        <X size={11} strokeWidth={2.2} />
                      </button>
                    </span>
                  ))
                )}
              </div>
              {boundAppIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => updatePreset(preset.id, { appIds: [] })}
                  className="shrink-0 text-[11px] text-text-tertiary underline-offset-2 hover:text-text-secondary"
                >
                  清空
                </button>
              )}
            </div>

            {/* 可选的应用 */}
            <p className="mt-3 text-[10px] text-text-tertiary">点一下添加 / 再点取消</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {appList.map((app) => (
                <AppChip
                  key={app.id}
                  label={app.name}
                  icon={appIcon(app.name)}
                  active={boundAppIds.includes(app.id)}
                  onClick={() => {
                    const next = boundAppIds.includes(app.id)
                      ? boundAppIds.filter((id) => id !== app.id)
                      : [...boundAppIds, app.id]
                    updatePreset(preset.id, { appIds: next })
                  }}
                />
              ))}
              {currentApp && (
                <AppChip
                  label={`${currentApp.name}（当前）`}
                  icon={appIcon(currentApp.name)}
                  active={boundAppIds.includes(currentApp.id)}
                  onClick={() => {
                    const next = boundAppIds.includes(currentApp.id)
                      ? boundAppIds.filter((id) => id !== currentApp.id)
                      : [...boundAppIds, currentApp.id]
                    updatePreset(preset.id, { appIds: next })
                  }}
                />
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={fetchAppList}
                className="rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-1.5 text-[12px] text-text-secondary active:scale-[0.98]"
              >
                获取电脑应用列表
              </button>
              <button
                type="button"
                onClick={fetchCurrentApp}
                className="rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-1.5 text-[12px] text-text-secondary active:scale-[0.98]"
              >
                获取当前应用
              </button>
              <span className="text-[11px] text-text-tertiary">
                {appList.length > 0 ? `已记录 ${appList.length} 个应用` : '还没拉过列表'}
              </span>
            </div>
          </Section>

          {/* ---------- ① 麦克风按钮的绑定 ---------- */}
          <Section
            title="麦克风按钮"
            hint="只绑定麦克风这一颗按钮；三个动作互相独立"
          >
            <MagnetSlot
              label="点按打开时"
              magnet={pressMagnet}
              onClick={() => setPicker({ kind: 'micPress' })}
            />
            <div className="mt-2">
              <MagnetSlot
                label="点按关闭时"
                magnet={releaseMagnet}
                onClick={() => setPicker({ kind: 'micRelease' })}
              />
            </div>
            <div className="mt-2">
              <MagnetSlot
                label="长按说话时"
                magnet={holdMagnet}
                onClick={() => setPicker({ kind: 'micHold' })}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
              「点按打开/关闭」是两次独立按键；「长按说话」按下时按住组合键，松手才松开。
            </p>
          </Section>

          {/* ---------- ② 独立快捷键磁贴 ---------- */}
          <Section
            title="独立快捷键磁贴"
            hint="底部磁贴用的快捷键，跟麦克风按钮无关"
          >
            {preset.tiles.length === 0 ? (
              <p className="text-[11px] text-text-tertiary">
                这个预案还没有磁贴
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {preset.tiles.map((tile) => {
                  const magnet = magnetOf(tile.magnetId ?? null)
                  const group = tile.groupId
                    ? (groups.find((g) => g.id === tile.groupId) ?? null)
                    : null
                  const iconName = group ? group.icon : magnet?.icon
                  const title = group ? group.name : (magnet?.label ?? '（磁片已删除）')
                  const subtitle = group
                    ? `${group.steps.length} 步 · 间隔 ${group.intervalSeconds}s`
                    : magnet && magnetHasKey(magnet)
                      ? magnetKeys(magnet)
                      : '未设置'
                  return (
                    <li
                      key={tile.id}
                      className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2"
                    >
                      {iconName &&
                        createElement(tileIcon(iconName), {
                          size: 14,
                          strokeWidth: 1.8,
                          className: 'shrink-0 text-text-secondary',
                        })}
                      <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                        {title}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPicker({ kind: 'tile', tileId: tile.id })}
                        aria-label={`更换磁贴「${title}」`}
                        className="tabular shrink-0 rounded-full px-2 py-1 text-[10px] transition-colors"
                        style={
                          group || (magnet && magnetHasKey(magnet))
                            ? {
                                background: 'var(--color-surface-3)',
                                color: 'var(--color-text-secondary)',
                              }
                            : { color: 'var(--color-text-faint)' }
                        }
                      >
                        {subtitle}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePreset(preset.id, {
                            tiles: preset.tiles.filter((t) => t.id !== tile.id),
                          })
                        }
                        aria-label={`移除磁贴「${title}」`}
                        className="grid size-8 shrink-0 place-items-center rounded-[10px] text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary"
                      >
                        <Trash2 size={13} strokeWidth={1.8} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <button
              type="button"
              onClick={() => setPicker({ kind: 'addTile' })}
              disabled={preset.tiles.length >= 6}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border-subtle text-[12px] text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary disabled:opacity-40"
            >
              <Plus size={14} strokeWidth={1.8} />
              添加磁贴
            </button>
            {preset.tiles.length >= 6 && (
              <p className="mt-1 text-[10px] text-text-faint">
                磁贴最多 6 个，删掉一个才能加新的
              </p>
            )}
          </Section>

          {/* ---------- 删除 ---------- */}
          {!preset.isDefault && (
            <button
              type="button"
              onClick={() => {
                deletePreset(preset.id)
                onClose()
              }}
              className="mt-4 flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-80"
              style={{ color: 'var(--color-recording)' }}
            >
              <Trash2 size={13} strokeWidth={1.8} />
              删除这套预案
            </button>
          )}
        </div>

        {/* ---------- 二级弹层 ---------- */}
        <AnimatePresence>
          {picker && (
            <MagnetPicker
              key="magnet-picker"
              magnets={magnets}
              groups={groups}
              onPick={(id) => applyMagnet(picker, id)}
              onPickGroup={(id) => applyGroup(picker, id)}
              onCreate={() => {
                setMagnetDraft({ magnet: null, applyTo: picker })
                setPicker(null)
              }}
              onClose={() => setPicker(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {magnetDraft && (
            <MagnetEditor
              key="magnet-editor"
              magnet={magnetDraft.magnet}
              onSave={saveMagnet}
              onClose={() => setMagnetDraft(null)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}

/* ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-4 first:mt-2">
      <h3 className="text-[12px] font-medium text-text-primary">{title}</h3>
      {hint && <p className="mt-0.5 text-[10px] text-text-tertiary">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}

function AppChip({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center gap-1.5 rounded-full border px-3 text-[11px] transition-colors"
      style={{
        borderColor: active
          ? 'var(--color-border-strong)'
          : 'var(--color-border-subtle)',
        background: active ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
        color: active
          ? 'var(--color-text-primary)'
          : 'var(--color-text-secondary)',
      }}
    >
      {Icon && createElement(Icon, { size: 12, strokeWidth: 1.8 })}
      {label}
    </button>
  )
}

/**
 * 一个磁片槽位 —— 显示当前绑的磁片，点一下去换
 * 这是「麦克风按钮的绑定」和「独立磁贴」的公共零件。
 */
function MagnetSlot({
  label,
  magnet,
  onClick,
}: {
  label: string
  magnet: HotkeyMagnet | null
  onClick: () => void
}) {
  const hasKey = magnetHasKey(magnet)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`选择${label}的磁片，当前 ${
        magnet ? magnet.label : '不绑定'
      }`}
      className="flex min-h-[44px] w-full items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface-3"
    >
      {magnet ? (
        createElement(tileIcon(magnet.icon), {
          size: 14,
          strokeWidth: 1.8,
          className: 'shrink-0 text-text-secondary',
        })
      ) : (
        <span className="grid size-4 shrink-0 place-items-center rounded-full border border-border-subtle" />
      )}
      <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
        {magnet?.label ?? '不绑定'}
      </span>
      <span className="shrink-0 text-[11px] text-text-tertiary">{label}</span>
      <span
        className="tabular shrink-0 rounded-full px-2 py-0.5 text-[10px]"
        style={
          hasKey
            ? {
                background: 'var(--color-surface-3)',
                color: 'var(--color-text-primary)',
              }
            : { color: 'var(--color-text-faint)' }
        }
      >
        {hasKey ? magnetKeys(magnet) : '未设置'}
      </span>
    </button>
  )
}

export { fadeFast, layoutSpring }
