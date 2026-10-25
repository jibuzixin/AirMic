import { useEffect, useRef, useState } from 'react'

/**
 * 径向电平表
 * ------------------------------------------------------------
 * 48 柱径向，环半径 150px。
 * 关键约束（来自 v0.2 教训）：
 *   .polar-bars 必须 pointer-events:none
 *   —— 旋转的方块会溢出到环形容器边界外，
 *      如果不拦截，会挡住下方麦克风按钮的点击。
 */
export function LevelRing({
  level,
  active,
  size = 300,
  bars = 48,
  state,
}: {
  level: number
  active: boolean
  size?: number
  bars?: number
  state: 'idle' | 'continuous' | 'ptt'
}) {
  const radius = size / 2 - 14
  const innerRadius = radius - 34

  // 环形排列：每根柱子角度均分，起始角从正上方（-90°）
  const barGeo = Array.from({ length: bars }, (_, i) => {
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2
    const w = (2 * Math.PI * radius) / bars
    const h = Math.max(3, w * 0.52)
    return {
      angle,
      w,
      h,
      // 柱高按电平从中心向外
      len: 4 + level * (radius - innerRadius) * 1.0,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })

  const color =
    state === 'idle'
      ? 'var(--color-text-faint)'
      : state === 'continuous'
        ? 'var(--color-amber-accent)'
        : 'var(--color-recording)'

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* 底层轨道 */}
      <svg
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      >
        {barGeo.map((b, i) => {
          const angle = b.angle
          const len = 4
          const x1 = Math.cos(angle) * (radius - len)
          const y1 = Math.sin(angle) * (radius - len)
          const x2 = Math.cos(angle) * radius
          const y2 = Math.sin(angle) * radius
          return (
            <line
              key={`track-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-surface-3)"
              strokeWidth={b.w * 0.5}
              strokeLinecap="round"
            />
          )
        })}
      </svg>

      {/* 活跃电平 */}
      <svg
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      >
        {barGeo.map((b, i) => {
          const angle = b.angle
          const len = b.len
          const x1 = Math.cos(angle) * (radius - len)
          const y1 = Math.sin(angle) * (radius - len)
          const x2 = Math.cos(angle) * radius
          const y2 = Math.sin(angle) * radius
          return (
            <line
              key={`live-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={b.w * 0.5}
              strokeLinecap="round"
              style={{
                transition: 'none',
                opacity: active ? 1 : 0.25,
              }}
            />
          )
        })}
      </svg>

      {/* 中心留白区 */}
      <div
        className="absolute rounded-full"
        style={{
          width: innerRadius * 2 - 26,
          height: innerRadius * 2 - 26,
          background: 'var(--color-surface-0)',
        }}
      />
    </div>
  )
}

/**
 * 电平驱动 hook —— **已废弃**
 *
 * 原来这里是随机数（假电平），界面上看着在跳，其实跟麦克风没关系。
 * 现在电平由原生采集算出来真实 RMS，通过插件事件送上来（store 的 `micLevel`）。
 */
export function useLevel(_active: boolean): number {
  return 0
}
