import { useEffect } from 'react'
import { PhoneShell } from '@/components/phone/PhoneShell'
import { useAirmic } from '@/lib/airmic-store'
import { BackStackProvider } from '@/lib/back-stack'

/**
 * 安卓端 App 入口
 * ------------------------------------------------------------
 * 路由规则（不可变，需求说明书 §3.1）：
 *   未配对 → **永远**进设备页
 *   已配对 → 每次打开**直接**进麦克风页
 */
export default function App() {
  const { insets, haptic } = useAirmic()

  // 所有按钮点击都给一下震动反馈（长按的持续脉冲在按钮组件里单独处理）
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('button')) haptic('tap')
    }
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [haptic])
  return (
    // 页面铺满全屏（画到状态栏下面），这里把系统栏的高度让出来。
    // 背景跟着主题走，不会像「窗口底色」那样露出一条白边。
    <div
      className="h-full w-full overflow-hidden bg-surface-0 text-text-primary"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <BackStackProvider>
        <PhoneShell mode="full" />
      </BackStackProvider>
    </div>
  )
}
