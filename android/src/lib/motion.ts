import type { Transition } from 'framer-motion'

/**
 * AirMic 动效 token（DESIGN.md §6）
 * ------------------------------------------------------------
 * 全部用 spring，禁止 ease-in-out。
 *
 * ⚠️ 一条容易踩的规则：
 *   **不要用慢 spring 驱动 opacity。**
 *   spring 驱动透明度时尾巴很长（300/30 要 600ms+ 才收敛到肉眼不可见），
 *   视觉上就是「内容半透明地飘进来」—— 这正是廉价感的来源。
 *   所以：
 *     几何（位移 / 缩放 / 高度）→ springSmooth / springSnappy
 *     透明度 → fadeFast（临界阻尼附近的快 spring，~150ms 收敛）
 */

/** 通用、面板展开、大范围位移 */
export const springSmooth: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
}

/** 按钮点击、磁贴按下、开关切换 */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 25,
}

/** 麦克风按钮按下回弹（带轻微过冲） */
export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 15,
}

/** 大范围位移、抽屉滑入 */
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 180,
  damping: 24,
}

/**
 * 透明度专用。快、临界阻尼、无过冲。
 * 只用于「元素出现 / 消失」的那一层薄雾，不要拿它做位移。
 */
export const fadeFast: Transition = {
  type: 'spring',
  stiffness: 700,
  damping: 45,
}

/**
 * 高度 / 折叠动画单独用。
 * 比 springSmooth 更硬，收敛更快 —— 折叠区内容多的时候不会拖出长尾。
 */
export const layoutSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 38,
}
