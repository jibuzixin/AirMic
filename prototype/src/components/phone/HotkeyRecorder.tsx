import { useMemo } from 'react'
import {
  KEY_CHOICES,
  MODIFIERS,
  MOUSE_CHOICES,
  magnetKeys,
  type HotkeyMagnet,
  type ModifierKey,
  type MouseKey,
} from '@/lib/hotkey'

/**
 * 快捷键录制器（软件内置的键盘 + 鼠标菜单）
 * ------------------------------------------------------------
 * 用户**依次点击**想要的按键，组成一个快捷键：
 *   1. 修饰键可以多选（⌃⌥⇧⌘），按 macOS 习惯顺序显示
 *   2. 键盘主键单选（跟修饰键叠加）
 *   3. 鼠标键单选，跟键盘主键互斥
 *
 * 全程可点改，不存在"输入框里手打组合键"那种别扭的交互。
 *
 * ⚠️ 主键的属性名必须叫 `mainKey`，**不能叫 `key`**：
 *   `key` 是 React 的保留属性，只用来做 element 的身份标识，
 *   **不会**作为 props 传给子组件。所以写成 `key={...}` 的话：
 *     - 子组件收到的 `props.key` 永远是 undefined
 *     - 每改一次主键，React 会认为 element 换了身份 → 整个子组件被卸载重建
 *   结果就是「点了主键没反应」：状态其实变了，只是 UI 永远拿不到这个值。
 */
export function HotkeyRecorder({
  modifiers,
  mainKey,
  mouse,
  onChange,
}: {
  modifiers: ModifierKey[]
  mainKey: string | null
  mouse: MouseKey | null
  onChange: (next: {
    modifiers: ModifierKey[]
    mainKey: string | null
    mouse: MouseKey | null
  }) => void
}) {
  const preview = useMemo(
    () =>
      magnetKeys(
        { id: 'preview', label: '', icon: 'Mic', modifiers, key: mainKey, mouse },
        ),
    [modifiers, mainKey, mouse],
  )

  const toggleModifier = (id: ModifierKey) => {
    onChange({
      modifiers: modifiers.includes(id)
        ? modifiers.filter((m) => m !== id)
        : [...modifiers, id],
      mainKey,
      mouse,
    })
  }

  const pickKey = (id: string) => {
    // 再次点同一个键 = 取消
    const nextKey = mainKey === id ? null : id
    onChange({ modifiers, mainKey: nextKey, mouse: nextKey ? null : mouse })
  }

  const pickMouse = (id: MouseKey) => {
    const nextMouse = mouse === id ? null : id
    onChange({ modifiers, mainKey: nextMouse ? null : mainKey, mouse: nextMouse })
  }

  const letters = KEY_CHOICES.filter((k) => k.group === '字母')
  const digits = KEY_CHOICES.filter((k) => k.group === '数字')
  const editing = KEY_CHOICES.filter((k) => k.group === '编辑键')
  const functionKeys = KEY_CHOICES.filter((k) => k.group === '功能键')
  const arrows = KEY_CHOICES.filter((k) => k.group === '方向键')
  const symbols = KEY_CHOICES.filter((k) => k.group === '符号')

  return (
    <div className="flex flex-col gap-3">
      {/* ---------- 实时预览 ---------- */}
      <div className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-surface-2 px-3 py-2">
        <span className="text-[10px] text-text-tertiary">组合键</span>
        <span className="tabular text-[13px] text-text-primary">
          {preview || <span className="text-text-faint">还没选键</span>}
        </span>
      </div>

      {/* ---------- 修饰键 ---------- */}
      <div>
        <RecorderLabel>修饰键（可多选）</RecorderLabel>
        <div className="mt-1.5 flex gap-1.5">
          {MODIFIERS.map((m) => {
            const active = modifiers.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleModifier(m.id)}
                aria-pressed={active}
                className="flex h-9 flex-1 items-center justify-center gap-1 rounded-[10px] border text-[11px] transition-colors"
                style={{
                  borderColor: active
                    ? 'var(--color-border-strong)'
                    : 'var(--color-border-subtle)',
                  background: active ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                  color: active
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-tertiary)',
                }}
              >
                <span className="text-[12px]">{m.symbol}</span>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ---------- 键盘主键 ---------- */}
      <div>
        <RecorderLabel>主键（单选）</RecorderLabel>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-1">
              {letters.slice(row * 10, row * 10 + 10).map((k) => (
                <KeyButton
                  key={k.id}
                  label={k.label}
                  active={mainKey === k.id}
                  onClick={() => pickKey(k.id)}
                />
              ))}
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            {digits.map((k) => (
              <KeyButton
                key={k.id}
                label={k.label}
                active={mainKey === k.id}
                onClick={() => pickKey(k.id)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {editing.map((k) => (
              <KeyButton
                key={k.id}
                label={k.label}
                active={mainKey === k.id}
                onClick={() => pickKey(k.id)}
                wide
              />
            ))}
            {arrows.map((k) => (
              <KeyButton
                key={k.id}
                label={k.label}
                active={mainKey === k.id}
                onClick={() => pickKey(k.id)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {functionKeys.map((k) => (
              <KeyButton
                key={k.id}
                label={k.label}
                active={mainKey === k.id}
                onClick={() => pickKey(k.id)}
              />
            ))}
            {symbols.map((k) => (
              <KeyButton
                key={k.id}
                label={k.label}
                active={mainKey === k.id}
                onClick={() => pickKey(k.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ---------- 鼠标键 ---------- */}
      <div>
        <RecorderLabel>鼠标键（跟主键互斥）</RecorderLabel>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MOUSE_CHOICES.map((m) => {
            const active = mouse === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMouse(m.id)}
                aria-pressed={active}
                className="h-9 rounded-[10px] border px-3 text-[11px] transition-colors"
                style={{
                  borderColor: active
                    ? 'var(--color-border-strong)'
                    : 'var(--color-border-subtle)',
                  background: active ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                  color: active
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-tertiary)',
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RecorderLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] text-text-tertiary">{children}</span>
  )
}

function KeyButton({
  label,
  active,
  onClick,
  wide,
}: {
  label: string
  active: boolean
  onClick: () => void
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'tabular grid h-8 place-items-center rounded-[8px] border text-[11px] transition-colors',
        wide ? 'min-w-[34px] px-1.5' : 'w-8',
      ].join(' ')}
      style={{
        borderColor: active
          ? 'var(--color-border-strong)'
          : 'var(--color-border-subtle)',
        background: active ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
        color: active
          ? 'var(--color-text-primary)'
          : 'var(--color-text-tertiary)',
      }}
    >
      {label}
    </button>
  )
}

/** 从磁铁取出录制器的初始状态 */
export function recorderState(magnet: HotkeyMagnet | null): {
  modifiers: ModifierKey[]
  mainKey: string | null
  mouse: MouseKey | null
} {
  if (!magnet) return { modifiers: [], mainKey: null, mouse: null }
  return {
    modifiers: magnet.modifiers,
    mainKey: magnet.key,
    mouse: magnet.mouse,
  }
}
