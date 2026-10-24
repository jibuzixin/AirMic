/**
 * 电脑端面板用的动效 token —— 统一转发到 `@/lib/motion`。
 *
 * 全项目只有一份动效基线（DESIGN.md §6），这里保留别名是为了
 * 不改动 MacPanel.tsx 等已有引用。
 */
export {
  springSmooth as SPRING_SMOOTH,
  springSnappy as SPRING_SNAPPY,
  springBouncy as SPRING_BOUNCY,
  springGentle as SPRING_GENTLE,
  fadeFast as FADE_FAST,
  layoutSpring as LAYOUT_SPRING,
} from '@/lib/motion'
