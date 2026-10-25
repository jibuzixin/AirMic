import AppKit

/// AirMic 电脑端入口
///
/// 用 AppKit 的 NSStatusItem + NSPanel（见 MenuBarController），
/// 而不是 SwiftUI 的 MenuBarExtra —— 这样毛玻璃是真的透，展开时窗口高度
/// 也只由我们控制，不会出现内容和窗口节奏错位导致的叠影。
@main
struct AirMicMain {
    /// NSApplication.delegate 是 weak，这里保留一份强引用
    private static var controller: MenuBarController?

    @MainActor
    static func main() {
        let app = NSApplication.shared
        let controller = MenuBarController()
        Self.controller = controller
        app.delegate = controller
        app.setActivationPolicy(.accessory)
        app.run()
    }
}
