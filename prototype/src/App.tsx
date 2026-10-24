import { AirmicProvider, useAirmic } from '@/lib/airmic-store'
import { FOREGROUND_APPS } from '@/lib/airmic-data'
import { MacPanel } from '@/components/mac/MacPanel'
import { PhoneShell } from '@/components/phone/PhoneShell'
import { appIcon } from '@/components/phone/icons'
import { createElement } from 'react'
import { Mic } from 'lucide-react'

/**
 * AirMic 原型演示页
 * ------------------------------------------------------------
 * 左：电脑端菜单栏面板 / 中：演示控制台 / 右：手机端
 *
 * 控制台是**演示脚手架**，不是产品界面 —— 所以用虚线边框跟产品 UI 区分开。
 */
export default function App() {
  return (
    <AirmicProvider>
      <Demo />
    </AirmicProvider>
  )
}

function Demo() {
  return (
    <div className="min-h-screen bg-surface-0 text-text-primary">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-8 py-10">
        <header className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-amber-accent">
            <Mic size={17} strokeWidth={2} color="#0B0B0D" />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">
              AirMic 原型
            </h1>
            <p className="text-[11px] leading-tight text-text-tertiary">
              把手机变成电脑的麦克风和遥控器
            </p>
          </div>
        </header>

        <div className="flex flex-wrap items-start gap-8">
          {/* ---------- 电脑端 ---------- */}
          <section className="flex flex-col gap-2">
            <SectionLabel>电脑端 · 菜单栏面板</SectionLabel>
            <MacPanel />
          </section>

          {/* ---------- 控制台 ---------- */}
          <DemoConsole />

          {/* ---------- 手机端 ---------- */}
          <section className="flex flex-col gap-2">
            <SectionLabel>手机端 · 主控界面</SectionLabel>
            <PhoneShell scale={0.82} />
          </section>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-faint">
      {children}
    </h2>
  )
}

/**
 * 演示控制台
 * ------------------------------------------------------------
 * 真实产品里没有这一栏 —— 它只存在于原型里，用来触发
 * 「电脑端前台应用变化」这类真实环境才有的事件。
 */
function DemoConsole() {
  const {
    foregroundApp,
    setForegroundApp,
    presets,
    activePresetId,
    paired,
    pairedDevice,
    disconnect,
    requestPair,
    startScan,
  } = useAirmic()

  const activePreset = presets.find((p) => p.id === activePresetId)

  return (
    <section className="flex w-[300px] flex-col gap-3">
      <SectionLabel>演示控制台 · 非产品界面</SectionLabel>

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-3">
        {/* ---------- 前台应用 ---------- */}
        <div>
          <h3 className="text-[12px] font-medium text-text-primary">
            电脑端前台应用
          </h3>
          <p className="mt-0.5 text-[10px] text-text-tertiary">
            切换后会按绑定关系自动切换手机端的预案
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FOREGROUND_APPS.map((app) => {
              const active = app.name === foregroundApp.name
              return (
                <button
                  key={app.bundleId}
                  type="button"
                  onClick={() => setForegroundApp(app.name)}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition-colors"
                  style={{
                    borderColor: active
                      ? 'var(--color-amber-accent)'
                      : 'var(--color-border-subtle)',
                    background: active
                      ? 'var(--color-surface-3)'
                      : 'var(--color-surface-1)',
                    color: active
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                  }}
                >
                  {createElement(appIcon(app.name), { size: 12, strokeWidth: 1.8 })}
                  {app.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* ---------- 当前预案 ---------- */}
        <div className="rounded-lg bg-surface-1 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">当前前台应用</span>
            <span className="flex items-center gap-1 text-[11px] text-text-secondary">
              {createElement(appIcon(foregroundApp.name), {
                size: 11,
                strokeWidth: 1.8,
              })}
              {foregroundApp.name}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">生效预案</span>
            <span className="text-[11px] text-text-primary">
              {activePreset?.name ?? '--'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">磁贴数</span>
            <span className="tabular text-[11px] text-text-secondary">
              {activePreset?.tiles.length ?? 0}
            </span>
          </div>
        </div>

        {/* ---------- 连接 ---------- */}
        <div>
          <h3 className="text-[12px] font-medium text-text-primary">连接</h3>
          <div className="mt-2 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={disconnect}
              disabled={!paired}
              className="h-8 rounded-lg border border-border-subtle bg-surface-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-40"
            >
              断开连接
            </button>
            <button
              type="button"
              onClick={() => requestPair('d2')}
              className="h-8 rounded-lg border border-border-subtle bg-surface-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              模拟 iPad 请求配对
            </button>
            <button
              type="button"
              onClick={startScan}
              className="h-8 rounded-lg border border-border-subtle bg-surface-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              重新扫描设备
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-8 rounded-lg border border-border-subtle text-[11px] text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-secondary"
            >
              重置原型
            </button>
          </div>
        </div>

        {/* ---------- 当前连接 ---------- */}
        <p className="text-[10px] leading-relaxed text-text-faint">
          {paired
            ? `手机已连接 ${pairedDevice?.name ?? ''}，直接进麦克风页`
            : '手机未配对，只能进设备页'}
        </p>
      </div>
    </section>
  )
}
