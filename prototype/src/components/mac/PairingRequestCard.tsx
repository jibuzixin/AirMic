import { motion } from 'framer-motion'
import { Bell } from 'lucide-react'
import { useAirmic } from '@/lib/airmic-store'
import { fadeFast, springSmooth } from '@/lib/motion'
import { Collapse } from '@/components/Collapse'

/**
 * 配对请求提示（需求说明书 §2.3 路径 A）
 * ------------------------------------------------------------
 * 手机发起配对 → 电脑端面板顶部出一条内联卡片（不是弹窗）。
 * 「允许」是此刻唯一的主操作 → 用琥珀色。
 * 出现/消失只动 transform 和 opacity，spring 过渡。
 */
export function PairingRequestCard() {
  const { pairingRequest, approvePairing, rejectPairing } = useAirmic()

  return (
    /*
     * 出现的丝滑关键：
     *   1. 高度用真实高度补间（Collapse）—— 下方内容靠文档流平滑让位；
     *      framer-motion 的 layout 靠 scale 校正尺寸，会把卡片内容压扁。
     *   2. 透明度用 fadeFast —— 慢 spring 驱动的 opacity 尾巴长达 600ms+，
     *      卡片会「半透明地飘进来」，中途截图能明显看到发虚。
     */
    <Collapse open={pairingRequest !== null} className="mb-3">
      {pairingRequest && (
        <motion.div
          key="pairing-request"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ opacity: fadeFast, default: springSmooth }}
          className="rounded-[10px] border border-border-strong bg-surface-2 p-3"
        >
          <div className="flex items-start gap-2">
            <Bell
              size={14}
              strokeWidth={1.8}
              aria-hidden
              className="mt-1 shrink-0 text-text-secondary"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-text-primary">
                「{pairingRequest.deviceName}」请求配对
              </p>
              <p className="mt-1 text-[11px] text-text-tertiary">
                {pairingRequest.model} · 允许后这台手机就能把麦克风接进电脑
              </p>

              <div className="mt-3 flex gap-2">
                <motion.button
                  type="button"
                  onClick={approvePairing}
                  whileTap={{ scale: 0.96 }}
                  transition={springSmooth}
                  className="rounded-[10px] bg-amber-accent px-3 py-2 text-[12px] font-semibold text-surface-0 transition-colors duration-150 hover:bg-amber-accent-hover active:bg-amber-accent-muted"
                >
                  允许
                </motion.button>
                <motion.button
                  type="button"
                  onClick={rejectPairing}
                  whileTap={{ scale: 0.96 }}
                  transition={springSmooth}
                  className="rounded-[10px] border border-border-subtle bg-surface-1 px-3 py-2 text-[12px] font-medium text-text-secondary transition-colors duration-150 hover:border-border-strong hover:bg-surface-3 hover:text-text-primary active:bg-surface-3"
                >
                  拒绝
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </Collapse>
  )
}
