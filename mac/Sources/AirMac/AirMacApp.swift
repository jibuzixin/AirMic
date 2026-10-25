import AirMicKit
import SwiftUI

/// AirMic 菜单栏应用。
///
/// - `LSUIElement = 1` → 不占 Dock、不在 Cmd-Tab 里（需求说明书 §1）
/// - 只有一个状态栏图标，点开是 318px 的面板
@main
struct AirMacApp: App {
    @StateObject private var state = AppState()

    /// 预览窗口要强引用，否则 ARC 立刻释放、窗口一闪而过
    private static var previewWindow: NSWindow?

    init() {
        // 单实例：已经有一个 AirMic 在跑就直接退出。
        //
        // ⚠️ 两个实例会抢同一个 TCP / UDP 端口：手机连到旧的那个，
        // 而用户看到的是新面板 —— 表现就是「点了没反应」「像闪退」，非常难查。
        let bundleID = Bundle.main.bundleIdentifier ?? "com.airmic.mac"
        let others = NSRunningApplication
            .runningApplications(withBundleIdentifier: bundleID)
            .filter { $0.processIdentifier != getpid() }
        if let existing = others.first {
            let path = existing.bundleURL?.path ?? "未知路径"
            let current = Bundle.main.bundlePath
            Log.error(
                "已有 AirMic 在运行（pid \(existing.processIdentifier)）：\(path)；本次启动退出。" +
                (path == current ? "" : "注意路径不同 —— 如果刚更新过版本，请先退出旧实例再启动新的。")
            )
            existing.activate(options: [.activateIgnoringOtherApps])
            exit(0)
        }

        // 开发用：AIRMIC_PREVIEW=1 时额外开一个普通窗口显示面板，
        // 方便截图检查浅色/深色、毛玻璃和展开动画（不影响正式行为）
        if ProcessInfo.processInfo.environment["AIRMIC_PREVIEW"] == "1" {
            let previewState = state
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                let hosting = NSHostingView(rootView: PanelView(state: previewState))
                hosting.setFrameSize(hosting.fittingSize)
                let window = NSWindow(
                    contentRect: NSRect(x: 0, y: 0, width: 318, height: 400),
                    styleMask: [.titled, .closable, .fullSizeContentView],
                    backing: .buffered,
                    defer: false
                )
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.isMovableByWindowBackground = true
                window.contentView = hosting
                // 固定位置，方便自动截图检查
                window.setFrame(NSRect(x: 240, y: 260, width: 318, height: 416), display: true)
                window.level = .floating
                AirMacApp.previewWindow = window
                window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            }
        }

        // 菜单栏应用不该出现在 Dock / Cmd-Tab 里
        NSApplication.shared.setActivationPolicy(.accessory)
        // 服务端是全局单例，必须活到 App 结束 —— 不能挂在视图生命周期上
        AirMicServer.shared.startOnLaunch()
    }

    var body: some Scene {
        MenuBarExtra {
            PanelView(state: state)
        } label: {
            // 有配对请求 → 铃铛；正在收音 → 麦克风
            if state.hasPendingPairRequest {
                Image(systemName: "bell.badge.fill")
                    .foregroundStyle(Theme.amber)
            } else {
                Image(systemName: state.isRecording ? "mic.fill" : "mic")
                    .foregroundStyle(state.isRecording ? Theme.recording : Theme.textPrimary)
            }
        }
        .menuBarExtraStyle(.window)
    }
}
