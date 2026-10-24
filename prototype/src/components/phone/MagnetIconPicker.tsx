import { createElement } from 'react'
import { ICON_CHOICES } from './icons'

/**
 * 磁铁图标选择
 * ------------------------------------------------------------
 * 磁铁 = 图标 + 名字 + 按键组合。图标是这个弹层里的第一件事。
 */
export function MagnetIconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (icon: string) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {ICON_CHOICES.map(({ name, Icon }) => {
        const active = name === value
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-label={`图标 ${name}`}
            aria-pressed={active}
            className="grid size-9 place-items-center rounded-[10px] border transition-colors"
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
            {createElement(Icon, { size: 16, strokeWidth: 1.7 })}
          </button>
        )
      })}
    </div>
  )
}
