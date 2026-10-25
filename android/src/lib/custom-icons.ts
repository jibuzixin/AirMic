/**
 * 自定义图标（用户自己上传的小图片）
 * ------------------------------------------------------------
 * 图片只保存在手机本地（localStorage），磁片里存的是 `custom:<key>`，
 * 这样同步给电脑端时不会把几 KB 的 base64 塞进配置里。
 */
const STORAGE_KEY = 'airmic.customIcons.v1'

let cache: Record<string, string> | null = null

function load(): Record<string, string> {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cache = raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    cache = {}
  }
  return cache
}

export function getCustomIcon(key: string): string | undefined {
  return load()[key]
}

export function saveCustomIcon(dataUrl: string): string {
  const key = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const map = load()
  map[key] = dataUrl
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* 存不下就算了 */
  }
  return key
}

/**
 * 把用户选的图片压成 64×64 的方形 PNG（cover 裁剪）。
 * 控制体积，避免 localStorage 被大图撑爆。
 */
export async function fileToIconDataUrl(
  file: File,
  size = 64,
): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法处理图片')
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.drawImage(
    bitmap,
    (size - width) / 2,
    (size - height) / 2,
    width,
    height,
  )
  return canvas.toDataURL('image/png')
}
