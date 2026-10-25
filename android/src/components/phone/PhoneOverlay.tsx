import { createContext, useContext } from 'react'

/**
 * 手机框级的覆盖层容器
 * ------------------------------------------------------------
 * 磁片选择器 / 磁片编辑器这类**二级弹层**必须盖住整个手机框，
 * 但它们是在预案抽屉（一个 absolute 定位的元素）里渲染的 ——
 * 直接写 `absolute inset-0` 只会盖住抽屉那一块。
 *
 * 所以在手机框上开一个空的覆盖层容器，二级弹层用 portal 挂进去。
 * 容器本身 `pointer-events-none`，空的时候不挡任何点击。
 */
export const PhoneOverlayContext = createContext<HTMLElement | null>(null)

export function usePhoneOverlay(): HTMLElement | null {
  return useContext(PhoneOverlayContext)
}
