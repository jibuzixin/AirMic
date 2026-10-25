import { createElement, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { ICON_CHOICES, tileIcon } from './icons'
import { fileToIconDataUrl, saveCustomIcon } from '@/lib/custom-icons'

/**
 * 磁片图标选择
 * ------------------------------------------------------------
 * 内置图标挑一个，或者上传一张自己的小图片（会压成 64×64 PNG）。
 */
export function MagnetIconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (icon: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const isCustom = value.startsWith('custom:')
  const CustomPreview = isCustom ? tileIcon(value) : null

  const handleFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await fileToIconDataUrl(file)
      const key = saveCustomIcon(dataUrl)
      onChange(`custom:${key}`)
    } catch {
      /* 图片处理失败就保持原样 */
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-8 gap-1">
        {isCustom && CustomPreview && (
          <button
            type="button"
            onClick={() => onChange(value)}
            aria-label="当前自定义图标"
            aria-pressed
            className="grid size-9 place-items-center rounded-[10px] border"
            style={{
              borderColor: 'var(--color-border-strong)',
              background: 'var(--color-surface-3)',
            }}
          >
            {createElement(CustomPreview, { size: 18 })}
          </button>
        )}

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
                background: active
                  ? 'var(--color-surface-3)'
                  : 'var(--color-surface-2)',
                color: active
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-tertiary)',
              }}
            >
              {createElement(Icon, { size: 16, strokeWidth: 1.7 })}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="上传自定义图标"
          disabled={busy}
          className="grid size-9 place-items-center rounded-[10px] border border-dashed border-border-subtle bg-surface-2 text-text-tertiary disabled:opacity-40"
        >
          <Upload size={15} strokeWidth={1.8} />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      <p className="text-[10px] leading-relaxed text-text-faint">
        也可以上传一张自己的小图片，会压缩成 64×64，只存在手机本地。
      </p>
    </div>
  )
}
