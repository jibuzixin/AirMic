import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { fadeFast, springSmooth } from '@/lib/motion'
import { usePhoneOverlay } from './PhoneOverlay'
import { useBackHandler } from '@/lib/back-stack'
import {
  magnetDisplay,
  magnetHasKey,
  magnetIsBound,
  magnetIsText,
  type HotkeyMagnet,
} from '@/lib/hotkey'
import { HotkeyRecorder, recorderState } from './HotkeyRecorder'
import { MagnetIconPicker } from './MagnetIconPicker'

/**
 * 磁片编辑器
 * ------------------------------------------------------------
 * 添加 / 编辑一个磁片，三步：
 *   1. 挑一个图标
 *   2. 起一个名字
 *   3. 选「快捷键」或「文本」：
 *      - 快捷键：用内置的键盘 + 鼠标菜单，依次点出想要的组合键
 *      - 文本：写一段提前编辑好的文字，触发时电脑直接把它粘贴出来
 *
 * 磁片是**全局共享**的：预案磁贴和麦克风按钮的按下/松开都引用它。
 */
export function MagnetEditor({
  magnet,
  onSave,
  onClose,
}: {
  /** null = 新建 */
  magnet: HotkeyMagnet | null
  onSave: (magnet: Omit<HotkeyMagnet, 'id'>) => void
  onClose: () => void
}) {
  useBackHandler(onClose, { priority: 30 })

  const [label, setLabel] = useState(magnet?.label ?? '')
  const [icon, setIcon] = useState(magnet?.icon ?? 'Command')
  const [rec, setRec] = useState(() => recorderState(magnet))
  /** 磁片类型：快捷键 / 文本 */
  const [kind, setKind] = useState<'key' | 'text'>(() =>
    magnetIsText(magnet) ? 'text' : 'key',
  )
  const [text, setText] = useState(magnet?.text ?? '')

  const isText = kind === 'text'
  const draft: HotkeyMagnet = {
    id: magnet?.id ?? 'draft',
    label,
    icon,
    modifiers: isText ? [] : rec.modifiers,
    key: isText ? null : rec.mainKey,
    mouse: isText ? null : rec.mouse,
    text: isText ? text : null,
  }
  const hasKey = isText ? text.trim().length > 0 : magnetHasKey(draft)
  const canSave = label.trim().length > 0 && hasKey

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
        className="absolute inset-x-0 bottom-0 z-30 flex max-h-[90%] flex-col rounded-t-2xl border-t border-border-subtle bg-surface-1"
      >
        <div className="flex cursor-grab touch-none flex-col items-center pt-2">
          <span className="h-1 w-9 rounded-full bg-surface-3" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-2">
          <h2 className="text-[15px] font-semibold text-text-primary">
            {magnet ? '编辑磁片' : '新建磁片'}
          </h2>
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
          {/* ---------- 1. 图标 ---------- */}
          <section className="mt-2">
            <h3 className="text-[12px] font-medium text-text-primary">图标</h3>
            <div className="mt-2">
              <MagnetIconPicker value={icon} onChange={setIcon} />
            </div>
          </section>

          {/* ---------- 2. 名字 ---------- */}
          <section className="mt-4">
            <h3 className="text-[12px] font-medium text-text-primary">名字</h3>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="比如「语音输入」"
              aria-label="磁片名字"
              className="mt-2 w-full rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-faint focus:border-border-strong"
            />
          </section>

          {/* ---------- 3. 类型：快捷键 / 文本 ---------- */}
          <section className="mt-4">
            <h3 className="text-[12px] font-medium text-text-primary">类型</h3>
            <div className="mt-2 flex gap-1.5">
              {(
                [
                  { id: 'key' as const, label: '快捷键' },
                  { id: 'text' as const, label: '文本' },
                ]
              ).map((option) => {
                const active = kind === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setKind(option.id)}
                    aria-pressed={active}
                    className="h-9 flex-1 rounded-[10px] border text-[12px] transition-colors"
                    style={{
                      borderColor: active
                        ? 'var(--color-border-strong)'
                        : 'var(--color-border-subtle)',
                      background: active
                        ? 'var(--color-surface-3)'
                        : 'var(--color-surface-2)',
                      color: active
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-secondary)',
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ---------- 4. 快捷键 / 文本内容 ---------- */}
          {isText ? (
            <section className="mt-4">
              <h3 className="text-[12px] font-medium text-text-primary">
                要粘贴的文本
              </h3>
              <p className="mt-0.5 text-[10px] text-text-tertiary">
                触发时电脑会直接粘贴这段文字（中文、emoji 都可以）
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="比如：帮我把这段话发给设计同学"
                aria-label="磁片的文本内容"
                rows={4}
                className="mt-2 w-full resize-none rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-text-primary outline-none placeholder:text-text-faint focus:border-border-strong"
              />
            </section>
          ) : (
            <section className="mt-4">
              <h3 className="text-[12px] font-medium text-text-primary">
                快捷键
              </h3>
              <p className="mt-0.5 text-[10px] text-text-tertiary">
                依次点出想要的组合键 —— 修饰键可以多选，主键单选
              </p>
              <div className="mt-2">
                {/*
                 * ⚠️ 主键必须传成 `mainKey`：
                 *   写成 `key={rec.mainKey}` 的话，`key` 会被 React 当成 element 的
                 *   身份标识吃掉 —— 子组件永远收到 undefined，
                 *   而且每改一次主键整个组件就被卸载重建，表现为「点了没反应」。
                 */}
                <HotkeyRecorder
                  modifiers={rec.modifiers}
                  mainKey={rec.mainKey}
                  mouse={rec.mouse}
                  onChange={setRec}
                />
              </div>
            </section>
          )}

          {!hasKey && (
            <p className="mt-3 text-[11px]" style={{ color: 'var(--color-recording)' }}>
              {isText
                ? '还没写内容 —— 磁片要有文本才能保存'
                : '还没选主键 —— 磁片要有至少一个键才能保存'}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() =>
                onSave({
                  label: label.trim(),
                  icon,
                  modifiers: isText ? [] : rec.modifiers,
                  key: isText ? null : rec.mainKey,
                  mouse: isText ? null : rec.mouse,
                  text: isText ? text : null,
                })
              }
              disabled={!canSave}
              className="h-10 flex-1 rounded-[10px] bg-amber-accent text-[13px] font-medium text-surface-0 transition-opacity disabled:opacity-40"
            >
              保存磁片
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-[10px] border border-border-subtle px-4 text-[13px] text-text-secondary transition-colors hover:bg-surface-2"
            >
              取消
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    overlay,
  )
}

/** 磁片在列表里显示的组合键（没配键时的占位） */
export function magnetKeyLabel(magnet: HotkeyMagnet | null | undefined): string {
  if (!magnet) return '未设置'
  return magnetIsBound(magnet) ? magnetDisplay(magnet) : '未设置'
}

export { AnimatePresence }
