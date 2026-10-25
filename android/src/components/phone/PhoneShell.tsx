import { useState } from 'react'
import { Signal, Wifi } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useAirmic } from '@/lib/airmic-store'
import { DevicePage } from './DevicePage'
import { MicPage } from './MicPage'
import { PresetPage } from './PresetPage'
import { MagnetLibraryPage } from './MagnetLibraryPage'
import { PresetEditor } from './PresetEditor'
import { PhoneOverlayContext } from './PhoneOverlay'

/**
 * 手机端外壳
 * ------------------------------------------------------------
 * 路由规则（不可变，需求说明书 §3.1）：
 *   未配对 → **永远**进设备页
 *   已配对 → 每次打开**直接**进麦克风页
 * 没有首页，也没有中间页。
 *
 * 预案编辑抽屉挂在这一层（不在 PresetPage 里），这样麦克风页的
 * 「按下 / 松开」键位芯片也能直接打开它 —— 快捷键设置入口不能只藏在预案页里。
 */
export function PhoneShell({
  scale = 1,
  /** full = 铺满真机屏幕；frame = 浏览器里预览用的手机壳 */
  mode = 'frame',
}: {
  scale?: number
  mode?: 'frame' | 'full'
}) {
  const { paired, presets, activePresetId } = useAirmic()
  const [page, setPage] = useState<'mic' | 'preset' | 'magnets'>('mic')
  /** 正在编辑的预案 id；null = 抽屉关闭 */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** 二级弹层（磁片选择器 / 磁片编辑器）的挂载点 */
  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null)

  // 重新连上以后回到麦克风页，不要停在预案页。
  // 用「渲染期间调整 state」而不是 useEffect —— React 官方推荐的写法，
  // 避免在 effect 里同步 setState 触发二次渲染。
  const [wasPaired, setWasPaired] = useState(paired)
  if (paired !== wasPaired) {
    setWasPaired(paired)
    if (paired) setPage('mic')
  }

  const editing = editingId
    ? (presets.find((p) => p.id === editingId) ?? null)
    : null

  if (mode === 'full') {
    return (
      <div className="h-full w-full">
        <PhoneOverlayContext.Provider value={overlayEl}>
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-0">
            <div className="relative min-h-0 flex-1">
              {!paired ? (
                <DevicePage />
              ) : page === 'mic' ? (
                <MicPage
                  onOpenPresets={() => setPage('preset')}
                  onEditMicBindings={() => setEditingId(activePresetId)}
                />
              ) : page === 'preset' ? (
                <PresetPage
                  onBack={() => setPage('mic')}
                  onEditPreset={(id) => setEditingId(id)}
                  onOpenMagnets={() => setPage('magnets')}
                />
              ) : (
                <MagnetLibraryPage onBack={() => setPage('preset')} />
              )}
            </div>

            <AnimatePresence>
              {editing && (
                <PresetEditor
                  key={editing.id}
                  preset={editing}
                  onClose={() => setEditingId(null)}
                />
              )}
            </AnimatePresence>

            <div
              ref={setOverlayEl}
              className="pointer-events-none absolute inset-0 z-40"
            />
          </div>
        </PhoneOverlayContext.Provider>
      </div>
    )
  }

  return (
    <div style={{ width: 390 * scale, height: 844 * scale }}>
      <PhoneOverlayContext.Provider value={overlayEl}>
      <div
        style={{
          width: 390,
          height: 844,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
        className="relative flex flex-col overflow-hidden rounded-[44px] border border-border-strong bg-surface-0"
      >
        {/* ---------- 系统状态栏（设备外壳，不是产品 UI） ---------- */}
        <div className="flex h-11 shrink-0 items-center justify-between px-7 pt-1 text-text-primary">
          <span className="tabular text-[12px] font-medium">{currentTime()}</span>
          <span className="flex items-center gap-1.5">
            <Signal size={13} strokeWidth={2} />
            <Wifi size={13} strokeWidth={2} />
          </span>
        </div>

        {/* ---------- 页面 ---------- */}
        <div className="relative min-h-0 flex-1">
          {!paired ? (
            <DevicePage />
          ) : page === 'mic' ? (
            <MicPage
              onOpenPresets={() => setPage('preset')}
              onEditMicBindings={() => setEditingId(activePresetId)}
            />
          ) : page === 'preset' ? (
            <PresetPage
              onBack={() => setPage('mic')}
              onEditPreset={(id) => setEditingId(id)}
              onOpenMagnets={() => setPage('magnets')}
            />
          ) : (
            <MagnetLibraryPage onBack={() => setPage('preset')} />
          )}
        </div>

        {/* ---------- 预案编辑抽屉（整个手机框的一层） ---------- */}
        <AnimatePresence>
          {editing && (
            <PresetEditor
              key={editing.id}
              preset={editing}
              onClose={() => setEditingId(null)}
            />
          )}
        </AnimatePresence>

        {/* ---------- 二级弹层的挂载点 ----------
            pointer-events-none：空的时候完全不挡手机页面的点击 */}
        <div
          ref={setOverlayEl}
          className="pointer-events-none absolute inset-0 z-40"
        />
      </div>
      </PhoneOverlayContext.Provider>
    </div>
  )
}

function currentTime(): string {
  const now = new Date()
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
}
