import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { fadeFast, layoutSpring } from '@/lib/motion'

/**
 * 折叠容器
 * ------------------------------------------------------------
 * 为什么不用 framer-motion 的 `layout` 属性做高度动画：
 *
 * `layout` 的尺寸补间是用 **scale** 做的校正 —— 元素高度从 44 变成 240，
 * 它就把整个元素 scaleY(5.5) 再反向补偿。**中间的子元素（标题、文字、图标）
 * 会跟着被压扁**，展开过程里能看到字是虚的、扁的。
 *
 * 这里改成 spring 驱动的真实高度补间（`height: 0 → 'auto'`）：
 *   - 高度是真的在变，文字全程清晰，不变形
 *   - 下方内容靠正常文档流跟着走，不需要给兄弟节点加 `layout`
 *     （给兄弟节点加 layout 反而会让它们一起被缩放）
 *   - 代价是每帧触发布局 —— 318px 的菜单栏面板里只有几十行，开销可忽略
 *
 * ⚠️ 透明度和高度用两套 transition：高度用 layoutSpring（慢一点更稳），
 * 透明度用 fadeFast（快）。慢 spring 驱动的 opacity 尾巴太长，
 * 会让内容「半透明地飘进来」。
 */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ height: layoutSpring, opacity: fadeFast }}
          style={{ overflow: 'hidden' }}
        >
          {/*
            className（比如 pb-3）必须挂在内层：
            挂在外层的话，收起时外层高度归零但 padding 还占着，
            面板上会留下一条空白（视觉上就是「收起时最后一下卡了一下」）。
          */}
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
