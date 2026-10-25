import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * 安卓返回键栈
 * ------------------------------------------------------------
 * 安卓的「返回」应该一级一级往回退，而不是直接把 App 扔回桌面。
 *
 * 页面 / 弹层打开时注册一个处理器；按返回键时执行**最上层**的那个。
 * 栈空了才最小化 App（不退出 —— 保留连接和状态）。
 */
type Handler = { run: () => void; priority: number }

const BackStackContext = createContext<{
  push: (handler: Handler) => () => void
} | null>(null)

export function BackStackProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<Handler[]>([])

  const push = useCallback((handler: Handler) => {
    handlers.current.push(handler)
    // 优先级高的永远在上面（页面 0 < 抽屉 10 < 选择器 20 < 编辑器 30）。
    // ⚠️ 不能只靠注册顺序：React 子组件的 effect 先于父组件执行，
    // 父级抽屉反而会排在子级后面，按返回就会先关外层、内层闪现消失。
    handlers.current.sort((a, b) => a.priority - b.priority)
    return () => {
      const index = handlers.current.indexOf(handler)
      if (index >= 0) handlers.current.splice(index, 1)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | undefined
    void App.addListener('backButton', () => {
      const handler = handlers.current[handlers.current.length - 1]
      if (handler) {
        handler.run()
      } else {
        // 已经在最外层：退到桌面但保留进程（回来不用重新扫描）
        void App.minimizeApp()
      }
    }).then((listener) => {
      remove = () => listener.remove()
    })
    return () => remove?.()
  }, [])

  const value = useMemo(() => ({ push }), [push])
  return (
    <BackStackContext.Provider value={value}>{children}</BackStackContext.Provider>
  )
}

/**
 * 注册返回键处理器（页面 / 弹层打开时调用）
 *
 * priority：页面 0（默认）、抽屉 10、选择器 20、编辑器 30。
 * 数字越大越先被返回键处理。
 */
export function useBackHandler(
  handler: () => void,
  options: { enabled?: boolean; priority?: number } = {},
) {
  const { enabled = true, priority = 0 } = options
  const context = useContext(BackStackContext)
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!context || !enabled) return
    return context.push({ run: () => ref.current(), priority })
  }, [context, enabled, priority])
}
