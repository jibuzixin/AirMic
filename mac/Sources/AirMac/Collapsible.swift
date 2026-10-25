import SwiftUI

/// 高度折叠容器
/// ------------------------------------------------------------
/// 「详细设置」展开/收起用它。
///
/// 为什么不用 SwiftUI 的 `.transition(.move)` + 窗口自动变高：
///   内容位移、窗口尺寸变化、裁切三件事同时发生，中间的帧会显得很乱。
/// 这里的做法是：
///   1. 内容始终按自然高度布局，用一个测量层拿到真实高度
///   2. 外层 `frame(height:)` 在 0 和真实高度之间做 spring 补间（真实高度，不是 scale）
///   3. 内容只做透明度淡入，不位移
/// 这样高度是平滑长出来的，文字全程清晰，不会出现中间帧错位。
struct Collapsible<Content: View>: View {
    let expanded: Bool
    @ViewBuilder var content: () -> Content

    @State private var contentHeight: CGFloat = 0

    var body: some View {
        content()
            .fixedSize(horizontal: false, vertical: true)
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(
                        key: CollapsibleHeightKey.self,
                        value: proxy.size.height
                    )
                }
            )
            .frame(height: expanded ? contentHeight : 0, alignment: .top)
            .clipped()
            .opacity(expanded ? 1 : 0)
            .onPreferenceChange(CollapsibleHeightKey.self) { contentHeight = $0 }
            .animation(.spring(response: 0.30, dampingFraction: 0.88), value: expanded)
    }
}

private struct CollapsibleHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
