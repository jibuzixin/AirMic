import AppKit
import Foundation

/// 监听电脑当前的前台应用。
///
/// 需求说明书 §2.2：应用切换时，手机端据此自动切换预案。
/// 用 `NSWorkspace.didActivateApplicationNotification` —— 切应用就会触发，
/// 不需要轮询。
public final class ForegroundAppWatcher {
    /// 前台应用变化时回调（参数：应用名、bundle id）
    public var onChange: ((ForegroundApp) -> Void)?

    private(set) var current: ForegroundApp

    private let workspace = NSWorkspace.shared
    private var observer: NSObjectProtocol?

    public init() {
        let active = workspace.frontmostApplication
        current = ForegroundApp(
            name: active?.localizedName ?? "访达",
            bundleId: active?.bundleIdentifier ?? "com.apple.finder"
        )
    }

    public func start() {
        guard observer == nil else { return }
        observer = workspace.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            else { return }
            let next = ForegroundApp(
                name: app.localizedName ?? "未知应用",
                bundleId: app.bundleIdentifier ?? ""
            )
            guard let self, next != self.current else { return }
            self.current = next
            DispatchQueue.main.async { [weak self] in
                self?.onChange?(next)
            }
        }
        Log.info("前台应用监听已启动，当前：\(current.name)")
    }

    public func stop() {
        if let observer {
            workspace.notificationCenter.removeObserver(observer)
            self.observer = nil
        }
    }

    deinit { stop() }
}
