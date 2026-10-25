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
type Handler = () => void

const BackStackContext = createContext<{
  push: (handler: Handler) => () => void
} | null>(null)

export function BackStackProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<Handler[]>([])

  const push = useCallback((handler: Handler) => {
    handlers.current.push(handler)
    return () => {
      const index = handlers.current.lastIndexOf(handler)
      if (index >= 0) handlers.current.splice(index, 1)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | undefined
    void App.addListener('backButton', () => {
      const handler = handlers.current[handlers.current.length - 1]
      if (handler) {
        handler()
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

/** 注册返回键处理器（页面 / 弹层打开时调用） */
export function useBackHandler(handler: Handler, enabled = true) {
  const context = useContext(BackStackContext)
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!context || !enabled) return
    return context.push(() => ref.current())
  }, [context, enabled])
}
