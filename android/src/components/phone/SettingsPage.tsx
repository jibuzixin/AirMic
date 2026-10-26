import {
  ChevronLeft,
  ChevronRight,
  Command,
  Layers,
  Unplug,
} from 'lucide-react'
import { DragToConfirm } from '@/components/ui/drag-to-confirm'
import { useAirmic } from '@/lib/airmic-store'
import { useBackHandler } from '@/lib/back-stack'

/**
 * 设置页
 * ------------------------------------------------------------
 * 预案页只放「预案」；磁片库、磁片组、省电、外观、连接管理都收在这里。
 */
export function SettingsPage({
  onBack,
  onOpenMagnets,
  onOpenGroups,
}: {
  onBack: () => void
  onOpenMagnets: () => void
  onOpenGroups: () => void
}) {
  useBackHandler(onBack)
  const {
    magnets,
    groups,
    themeMode,
    setThemeMode,
    silenceSeconds,
    setSilenceSeconds,
    linkIdleMinutes,
    setLinkIdleMinutes,
    openBatterySettings,
    hapticsEnabled,
    hapticStrength,
    setHapticsEnabled,
    setHapticStrength,
    pairedDevice,
    disconnect,
    unpair,
  } = useAirmic()

  const linkIdleLabel =
    linkIdleMinutes === 0
      ? '不自动断开'
      : linkIdleMinutes === 60
        ? '1 小时'
        : linkIdleMinutes === 120
          ? '2 小时'
          : `${linkIdleMinutes} 分钟`

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回预案"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary active:scale-95"
        >
          <ChevronLeft size={17} strokeWidth={1.8} />
        </button>
        <h1 className="text-[15px] font-semibold text-text-primary">设置</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {/* ---------- 内容管理 ---------- */}
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-1">
          <SettingRow
            icon={<Command size={15} strokeWidth={1.8} />}
            label="磁片库"
            value={`${magnets.length} 个`}
            onClick={onOpenMagnets}
          />
          <div className="ml-11 h-px bg-border-subtle" />
          <SettingRow
            icon={<Layers size={15} strokeWidth={1.8} />}
            label="磁片组"
            value={`${groups.length} 组`}
            onClick={onOpenGroups}
          />
        </div>

        {/* ---------- 省电 ---------- */}
        <SectionCard title="省电">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-text-secondary">
              静默自动关闭麦克风
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="减少静默时间"
                onClick={() => setSilenceSeconds(Math.max(0, silenceSeconds - 5))}
                className="grid size-8 place-items-center rounded-[8px] border border-border-subtle text-[14px] text-text-secondary active:scale-95"
              >
                −
              </button>
              <span className="tabular w-12 text-center text-[12px] text-text-primary">
                {silenceSeconds === 0 ? '关闭' : `${silenceSeconds}s`}
              </span>
              <button
                type="button"
                aria-label="增加静默时间"
                onClick={() =>
                  setSilenceSeconds(Math.min(120, silenceSeconds + 5))
                }
                className="grid size-8 place-items-center rounded-[8px] border border-border-subtle text-[14px] text-text-secondary active:scale-95"
              >
                +
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-text-faint">
            常开收音时，超过这么久没有声音就自动关闭。
          </p>

          <div className="mt-4 border-t border-border-subtle pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-text-secondary">
                闲置后断开连接
              </span>
              <span className="tabular text-[12px] text-text-primary">
                {linkIdleLabel}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {([
                { value: 30, label: '30 分钟' },
                { value: 60, label: '1 小时' },
                { value: 120, label: '2 小时' },
                { value: 0, label: '不自动' },
              ] as const).map((option) => {
                const active = linkIdleMinutes === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLinkIdleMinutes(option.value)}
                    aria-pressed={active}
                    className="h-9 rounded-[8px] border text-[11px] transition-colors"
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
                    {option.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-text-faint">
              手机退到后台且没有收音时，连接会继续保持；超过所选时间才断开，下次打开自动重连。
              熄屏期间会短暂持有 Wi-Fi 锁，到设定时间或回到前台立刻释放。
            </p>
            <button
              type="button"
              onClick={openBatterySettings}
              className="mt-2 h-9 w-full rounded-[8px] border border-border-subtle bg-surface-2 text-[11px] text-text-secondary transition-colors hover:bg-surface-3 active:scale-[0.99]"
            >
              允许后台运行（系统电池设置）
            </button>
            <p className="mt-1.5 text-[10px] leading-relaxed text-text-faint">
              三星 / vivo / 小米等系统的省电策略可能杀掉前台服务；把这个开关打开后更稳。
            </p>
          </div>
        </SectionCard>

        {/* ---------- 外观 ---------- */}
        <SectionCard title="外观">
          <div className="flex gap-2">
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
        </SectionCard>

        {/* ---------- 震动 ---------- */}
        <SectionCard title="震动反馈">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-text-secondary">
              点击 / 长按按钮时震动
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={hapticsEnabled}
              aria-label="震动反馈"
              onClick={() => setHapticsEnabled(!hapticsEnabled)}
              className="relative h-6 w-10 shrink-0 rounded-full transition-colors"
              style={{
                background: hapticsEnabled
                  ? 'var(--color-amber-accent)'
                  : 'var(--color-surface-3)',
              }}
            >
              <span
                className="absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform"
                style={{
                  left: 2,
                  transform: hapticsEnabled ? 'translateX(16px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          {hapticsEnabled && (
            <div className="mt-2 flex gap-2">
              {(
                [
                  { id: 'light', label: '轻' },
                  { id: 'normal', label: '标准' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setHapticStrength(option.id)}
                  className={
                    hapticStrength === option.id
                      ? 'flex-1 rounded-[10px] border border-border-strong bg-surface-3 py-1.5 text-[12px] text-text-primary'
                      : 'flex-1 rounded-[10px] border border-border-subtle bg-surface-2 py-1.5 text-[12px] text-text-secondary'
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[10px] leading-relaxed text-text-faint">
            长按时会持续震动；iOS 没有震动 API，会自动忽略。
          </p>
        </SectionCard>

        {/* ---------- 连接 ---------- */}
        <SectionCard title="连接">
          <p className="text-[12px] text-text-secondary">
            当前连接
            <span className="ml-1.5 text-text-primary">
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
        </SectionCard>

        <p className="mt-4 text-center text-[10px] text-text-faint">
          版本 0.6.4 · 构建 {__BUILD_TIME__}
        </p>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 rounded-xl border border-border-subtle bg-surface-1 p-3">
      <p className="mb-2 text-[11px] text-text-tertiary">{title}</p>
      {children}
    </div>
  )
}

function SettingRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-3"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-surface-2 text-text-secondary">
        {icon}
      </span>
      <span className="flex-1 text-[12px] text-text-primary">{label}</span>
      {value && (
        <span className="tabular text-[11px] text-text-tertiary">{value}</span>
      )}
      <ChevronRight size={14} strokeWidth={1.8} className="text-text-faint" />
    </button>
  )
}
