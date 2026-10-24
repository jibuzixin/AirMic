import { PhoneShell } from '@/components/phone/PhoneShell'

/**
 * 安卓端 App 入口
 * ------------------------------------------------------------
 * 路由规则（不可变，需求说明书 §3.1）：
 *   未配对 → **永远**进设备页
 *   已配对 → 每次打开**直接**进麦克风页
 */
export default function App() {
  return (
    <div className="h-full w-full overflow-hidden bg-surface-0 text-text-primary">
      <PhoneShell mode="full" />
    </div>
  )
}
