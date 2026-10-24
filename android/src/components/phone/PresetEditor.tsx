import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createElement } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Preset } from '@/lib/airmic-data'
import { useAirmic } from '@/lib/airmic-store'
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
 *   ① 麦克风按钮「按下」「松开」各执行一个**磁铁**
 *   ② 独立快捷键磁贴（不与麦克风绑定）
 *   两者是**两处不同的绑定**，UI 上分成两个独立区块，不能混为一谈。
 *
 * 磁铁是全局的：图标 + 名字 + 按键组合，磁贴和麦克风按钮共用同一批。
 *
 * ⚠️ 抽屉拿到的必须是 store 里的**实时对象** ——
 *   存对象快照的话，这里改 store、界面显示旧快照 —— 点了没反应。
 */

/** 这层弹层要作用到哪个位置 */
type PickerTarget =
  | { kind: 'micPress' }
  | { kind: 'micRelease' }
  | { kind: 'tile'; tileId: string }
  | { kind: 'addTile' }

export function PresetEditor({
  preset,
  onClose,
}: {
  preset: Preset
  onClose: () => void
}) {
  const {
    magnets,
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

  /** 正在挑磁铁 */
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  /** 正在新建 / 编辑磁铁；applyTo = 保存后应用到哪个位置 */
  const [magnetDraft, setMagnetDraft] = useState<{
    magnet: HotkeyMagnet | null
    applyTo: PickerTarget | null
  } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const magnetOf = (id: string | null) =>
    id ? (magnets.find((m) => m.id === id) ?? null) : null

  /** 把一个磁铁绑定到目标位置 */
  const applyMagnet = (target: PickerTarget, magnetId: string | null) => {
    if (target.kind === 'micPress') {
      updatePreset(preset.id, { micPressId: magnetId })
    } else if (target.kind === 'micRelease') {
      updatePreset(preset.id, { micReleaseId: magnetId })
    } else if (target.kind === 'tile') {
      updatePreset(preset.id, {
        tiles: preset.tiles.map((t) =>
          t.id === target.tileId ? { ...t, magnetId: magnetId ?? '' } : t,
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

  /** 保存磁铁 */
  const saveMagnet = (draft: Omit<HotkeyMagnet, 'id'>) => {
    if (magnetDraft?.magnet) {
      updateMagnet(magnetDraft.magnet.id, draft)
      setMagnetDraft(null)
      return
    }
    const id = addMagnet(draft)
    setMagnetDraft(null)
    // 新建的磁铁直接应用到发起它的地方
    if (magnetDraft?.applyTo) applyMagnet(magnetDraft.applyTo, id)
  }

  const pressMagnet = magnetOf(preset.micPressId)
  const releaseMagnet = magnetOf(preset.micReleaseId)

  return (
    /*
     * 抽屉和磁铁选择器 / 磁铁编辑器是同一套交互：
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

          {/* ---------- 绑定应用 ---------- */}
          <Section title="绑定电脑应用" hint="切到这个应用时自动启用本预案">
            <div className="flex flex-wrap gap-2">
              <AppChip
                label="不绑定"
                active={!preset.appId && !preset.appName}
                onClick={() => updatePreset(preset.id, { appName: null, appId: null })}
              />
              {/* 应用列表来自电脑端（用户主动拉取，手机端本地缓存） */}
              {appList.map((app) => (
                <AppChip
                  key={app.id}
                  label={app.name}
                  icon={appIcon(app.name)}
                  active={preset.appId === app.id}
                  onClick={() => updatePreset(preset.id, { appName: app.name, appId: app.id })}
                />
              ))}
              {/* 当前应用：只显示，不进列表 */}
              {currentApp && (
                <AppChip
                  label={`${currentApp.name}（当前）`}
                  icon={appIcon(currentApp.name)}
                  active={preset.appId === currentApp.id}
                  onClick={() =>
                    updatePreset(preset.id, {
                      appName: currentApp.name,
                      appId: currentApp.id,
                    })
                  }
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
            hint="按下 / 松开时在电脑触发的快捷键 —— 只绑定麦克风这一颗按钮"
          >
            <MagnetSlot
              label="按下时"
              magnet={pressMagnet}
              onClick={() => setPicker({ kind: 'micPress' })}
            />
            <div className="mt-2">
              <MagnetSlot
                label="松开时"
                magnet={releaseMagnet}
                onClick={() => setPicker({ kind: 'micRelease' })}
              />
            </div>
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
                  const magnet = magnetOf(tile.magnetId)
                  return (
                    <li
                      key={tile.id}
                      className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2"
                    >
                      {magnet &&
                        createElement(tileIcon(magnet.icon), {
                          size: 14,
                          strokeWidth: 1.8,
                          className: 'shrink-0 text-text-secondary',
                        })}
                      <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                        {magnet?.label ?? '（磁铁已删除）'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPicker({ kind: 'tile', tileId: tile.id })}
                        aria-label={`更换磁贴「${magnet?.label ?? ''}」的快捷键`}
                        className="tabular shrink-0 rounded-full px-2 py-1 text-[10px] transition-colors"
                        style={
                          magnet && magnetHasKey(magnet)
                            ? {
                                background: 'var(--color-surface-3)',
                                color: 'var(--color-text-secondary)',
                              }
                            : { color: 'var(--color-text-faint)' }
                        }
                      >
                        {magnet && magnetHasKey(magnet)
                          ? magnetKeys(magnet)
                          : '未设置'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePreset(preset.id, {
                            tiles: preset.tiles.filter((t) => t.id !== tile.id),
                          })
                        }
                        aria-label={`移除磁贴「${magnet?.label ?? ''}」`}
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

          {/* ---------- 磁铁库（全局） ---------- */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setLibraryOpen((v) => !v)}
              aria-expanded={libraryOpen}
              className="flex w-full items-center justify-between rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-3"
            >
              <span>磁铁库（{magnets.length}）</span>
              <motion.span
                aria-hidden
                className="flex items-center"
                animate={{ rotate: libraryOpen ? 180 : 0 }}
                transition={springSmooth}
              >
                <Plus
                  size={13}
                  strokeWidth={1.8}
                  style={{ transform: libraryOpen ? 'none' : 'rotate(45deg)' }}
                />
              </motion.span>
            </button>

            <Collapse open={libraryOpen}>
              <div className="pt-2">
                <p className="text-[10px] text-text-tertiary">
                  磁铁是全局的 —— 磁贴和麦克风按钮共用这一批
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {magnets.map((magnet) => (
                    <li
                      key={magnet.id}
                      className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2"
                    >
                      {createElement(tileIcon(magnet.icon), {
                        size: 14,
                        strokeWidth: 1.8,
                        className: 'shrink-0 text-text-secondary',
                      })}
                      <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                        {magnet.label}
                      </span>
                      <span className="tabular shrink-0 text-[10px] text-text-tertiary">
                        {magnetHasKey(magnet) ? magnetKeys(magnet) : '未设置'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setMagnetDraft({ magnet, applyTo: null })
                        }
                        className="shrink-0 rounded-full px-2 py-1 text-[10px] text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMagnet(magnet.id)}
                        aria-label={`删除磁铁「${magnet.label}」`}
                        className="grid size-8 shrink-0 place-items-center rounded-[10px] text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary"
                      >
                        <Trash2 size={13} strokeWidth={1.8} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() =>
                    setMagnetDraft({ magnet: null, applyTo: null })
                  }
                  className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border-subtle text-[12px] text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary"
                >
                  <Plus size={14} strokeWidth={1.8} />
                  新建磁铁
                </button>
              </div>
            </Collapse>
          </div>

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
              onPick={(id) => applyMagnet(picker, id)}
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
 * 一个磁铁槽位 —— 显示当前绑的磁铁，点一下去换
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
      aria-label={`选择${label}的磁铁，当前 ${
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
