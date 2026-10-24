import AirMicKit
import SwiftUI

/// AirMic 菜单栏应用。
///
/// - `LSUIElement = 1` → 不占 Dock、不在 Cmd-Tab 里（需求说明书 §1）
/// - 只有一个状态栏图标，点开是 318px 的面板
@main
struct AirMacApp: App {
    @StateObject private var state = AppState()

    init() {
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
