import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils'
import { Collapse } from '@/components/Collapse'
import { springSmooth, springSnappy } from '@/lib/motion'

/**
 * 折叠的「详细设置」（需求说明书 §2.1 第 5 项）
 * ------------------------------------------------------------
 * 默认折叠 —— 常态不占空间，统计只给排查时看。
 *
 * 统计四项（丢包 / 抖动 / 欠载 / 延迟）在本原型里没有真实数据源：
 * 按 DESIGN.md §10「不造假数据」，一律显示 [--]，
 * 不写 99.99% / 0.2% 这类假精度数字。
 */
const STAT_ITEMS = [
  { key: 'packetLoss', label: '丢包' },
  { key: 'jitter', label: '抖动' },
  { key: 'underrun', label: '欠载' },
  { key: 'latency', label: '延迟' },
] as const

export function AdvancedSettings() {
  const { bufferMs, setBufferMs, testToneOn, toggleTestTone } = useAirmic()
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="border-t border-border-subtle">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="airmic-advanced-body"
          className="flex w-full items-center justify-between rounded-[10px] px-1 py-3 text-[12px] text-text-secondary transition-colors duration-150 ease-spring-soft hover:bg-surface-2 hover:text-text-primary active:bg-surface-3"
        >
          <span>详细设置</span>
          <motion.span
            aria-hidden
            className="flex items-center"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={springSmooth}
          >
            <ChevronDown size={14} strokeWidth={1.8} />
          </motion.span>
        </button>
      </h3>

      {/*
        展开的丝滑关键（两处，缺一不可）：
        1. 高度用真实高度补间，不要用 framer-motion 的 layout ——
           layout 靠 scale 校正尺寸，会把标题行压扁。
        2. 透明度用 fadeFast，别用慢 spring —— 慢 spring 拖 600ms+，
           内容会「半透明地飘进来」，展开中途截图能明显看到字是虚的。
      */}
      <Collapse open={expanded} className="pb-3">
        <div id="airmic-advanced-body">
          {/* --- 统计 --- */}
          <p className="text-[10px] text-text-faint">
            接入音频管线后显示实时数值
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {STAT_ITEMS.map((item) => (
              <div
                key={item.key}
                className="rounded-[10px] border border-border-subtle bg-surface-2 px-2 py-2"
              >
                <div className="text-[10px] text-text-tertiary">{item.label}</div>
                <div className="tabular mt-1 text-[13px] text-text-secondary">
                  [--]
                  </div>
                </div>
              ))}
            </div>

            {/* --- 抖动缓冲 --- */}
            <div className="mt-3 border-t border-border-subtle pt-3">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="airmic-buffer"
                  className="text-[12px] text-text-secondary"
                >
                  抖动缓冲
                </label>
                <span className="flex items-baseline gap-1 text-[12px] text-text-primary">
                  <AnimatedNumber
                    value={bufferMs}
                    suffix="ms"
                    className="text-text-primary text-[13px]"
                  />
                </span>
              </div>
              <input
                id="airmic-buffer"
                type="range"
                min={10}
                max={120}
                step={10}
                value={bufferMs}
                onChange={(e) => setBufferMs(Number(e.target.value))}
                aria-label="抖动缓冲，10 到 120 毫秒"
                className="mt-2 w-full cursor-pointer accent-[var(--color-border-strong)]"
              />
              <div className="tabular mt-1 flex justify-between text-[10px] text-text-faint">
                <span>10ms</span>
                <span>120ms</span>
              </div>
            </div>

            {/* --- 1kHz 测试音 --- */}
            <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
              <div>
                <div className="text-[12px] text-text-secondary">1kHz 测试音</div>
                <div
                  className={cn(
                    'mt-1 text-[10px]',
                    testToneOn ? 'text-connected' : 'text-text-faint',
                  )}
                >
                  {testToneOn ? '正在播放校准音' : '关闭'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={testToneOn}
                aria-label="1kHz 测试音"
                onClick={toggleTestTone}
                className="relative h-[24px] w-[40px] shrink-0 rounded-full border border-border-subtle transition-colors duration-150 ease-spring-soft hover:border-border-strong"
                style={{
                  background: testToneOn
                    ? 'var(--color-connected)'
                    : 'var(--color-surface-3)',
                }}
              >
                <motion.span
                  aria-hidden
                  className="absolute top-[4px] left-[4px] block h-[16px] w-[16px] rounded-full"
                  style={{ background: 'var(--color-text-primary)' }}
                  animate={{ x: testToneOn ? 16 : 0 }}
                  transition={springSnappy}
                />
              </button>
            </div>
        </div>
      </Collapse>
    </section>
  )
}
