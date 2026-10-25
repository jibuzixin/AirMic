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
  const { insets } = useAirmic()
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
