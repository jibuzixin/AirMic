import AppKit
import Combine
import SwiftUI
import AirMicKit

/// 菜单栏控制器
/// ------------------------------------------------------------
/// 用 AppKit 的 `NSStatusItem` + 无边框 `NSPanel` 自己管窗口，而不是 SwiftUI 的
/// `MenuBarExtra`。原因有两个：
///
/// 1. **毛玻璃**：`MenuBarExtra` 的窗口是不透明的，`Material` 只能画出接近实心的
///    底色；把 `NSVisualEffectView`（`.popover` + behindWindow）放进透明窗口，
///    才有控制中心那种真正透出桌面的效果。
///
/// 2. **展开动画**：`MenuBarExtra` 会自己改窗口高度，SwiftUI 又在同时做内容布局
///    动画，两边节奏对不上就会出现内容叠在一起。这里窗口高度**只有我们在动**
///    （顶部固定、向下生长），内容不参与布局动画，从根上消除叠影。
@MainActor
final class MenuBarController: NSObject, NSApplicationDelegate {

    // MARK: - 状态

    private let state = AppState()
    private let bundleID = "com.airmic.mac"

    private var statusItem: NSStatusItem!
    private var panel: NSPanel!
    private var hosting: NSHostingView<PanelView>!
    private var cancellables = Set<AnyCancellable>()

    /// 当前内容高度（由 SwiftUI 上报）
    private var contentHeight: CGFloat = 420
    private var outsideMonitor: Any?
    private var escapeMonitor: Any?

    private let panelWidth: CGFloat = 318

    // MARK: - 生命周期

    func applicationWillFinishLaunching(_ notification: Notification) {
        // 开发用：AIRMIC_ALLOW_MULTI=1 时允许多开（配合 AIRMIC_PORT 做隔离测试）
        if ProcessInfo.processInfo.environment["AIRMIC_ALLOW_MULTI"] == "1" {
            return
        }
        // 单实例：两个实例会抢同一组端口，表现是「点了没反应」「像闪退」
        let others = NSRunningApplication
            .runningApplications(withBundleIdentifier: bundleID)
            .filter { $0.processIdentifier != getpid() }
        if let existing = others.first {
            let path = existing.bundleURL?.path ?? "未知路径"
            let current = Bundle.main.bundlePath
            Log.error(
                "已有 AirMic 在运行（pid \(existing.processIdentifier)）：\(path)；本次启动退出。" +
                (path == current ? "" : "注意路径不同 —— 请先退出旧实例再启动新的。")
            )
            existing.activate(options: [.activateIgnoringOtherApps])
            exit(0)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        // 打开应用就默认开始收音（用户要求）
        AirMicServer.shared.autoRecordOnLaunch = true
        AirMicServer.shared.startOnLaunch()

        setupStatusItem()
        setupPanel()
        state.start()
        observeIcon()

        // 开发用：AIRMIC_SHOW_PANEL=1 启动后直接展开面板（配合截图/检查）
        if ProcessInfo.processInfo.environment["AIRMIC_SHOW_PANEL"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.showPanel()
            }
        }

        // 点别的应用时自动收起
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidResignActive),
            name: NSApplication.didResignActiveNotification,
            object: nil
        )
    }

    // MARK: - 状态栏图标

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: "mic", accessibilityDescription: "AirMic")
        button.image?.isTemplate = true
        button.target = self
        button.action = #selector(togglePanel)
        updateIcon()
    }

    private func observeIcon() {
        // AppState 会把服务端的变化转发出来
        state.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] in
                // objectWillChange 早于值更新，下一轮再读
                DispatchQueue.main.async { self?.updateIcon() }
            }
            .store(in: &cancellables)
    }

    private func updateIcon() {
        guard let button = statusItem.button else { return }
        let symbol: String
        let tint: NSColor
        if state.hasPendingPairRequest {
            symbol = "bell.badge.fill"
            tint = .systemOrange
        } else if state.isRecording {
            symbol = "mic.fill"
            tint = .systemRed
        } else {
            symbol = "mic"
            tint = .labelColor
        }
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: "AirMic")
        image?.isTemplate = true
        button.image = image
        button.contentTintColor = tint
    }

    // MARK: - 面板

    private func setupPanel() {
        // 毛玻璃：和控制中心同一套材质（.popover + behindWindow）
        let effect = NSVisualEffectView()
        effect.material = .hudWindow
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.isEmphasized = true
        // ⚠️ NSVisualEffectView 的材质是私有图层画的，`layer.cornerRadius` 裁不掉它 ——
        // 必须用 maskImage（可拉伸的圆角遮罩），四个角才会真的圆。
        effect.maskImage = Self.roundedMask(radius: 16)

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: panelWidth, height: contentHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentView = effect
        panel.isMovable = false
        panel.hidesOnDeactivate = false

        let root = PanelView(state: state) { [weak self] height in
            self?.contentHeightChanged(height)
        }
        let hosting = NSHostingView(rootView: root)
        hosting.translatesAutoresizingMaskIntoConstraints = false
        effect.addSubview(hosting)
        NSLayoutConstraint.activate([
            hosting.leadingAnchor.constraint(equalTo: effect.leadingAnchor),
            hosting.trailingAnchor.constraint(equalTo: effect.trailingAnchor),
            hosting.topAnchor.constraint(equalTo: effect.topAnchor),
        ])

        self.hosting = hosting
        self.panel = panel
    }

    /// 可拉伸的圆角遮罩（用于 NSVisualEffectView）
    private static func roundedMask(radius: CGFloat) -> NSImage {
        let edge = radius * 2 + 1
        let image = NSImage(size: NSSize(width: edge, height: edge), flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        image.resizingMode = .stretch
        return image
    }

    /// SwiftUI 内容高度变了 → 动画窗口高度（顶部固定，向下生长）
    private func contentHeightChanged(_ height: CGFloat) {
        let target = max(140, height)
        guard abs(target - contentHeight) > 0.5 else { return }
        contentHeight = target
        guard panel.isVisible else { return }

        var frame = panel.frame
        let top = frame.maxY
        frame.size.height = target
        frame.origin.y = top - target

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.22
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.32, 0.72, 0, 1)
            panel.animator().setFrame(frame, display: true)
        }
    }

    // MARK: - 显示 / 隐藏

    @objc private func togglePanel() {
        if panel.isVisible {
            hidePanel()
        } else {
            showPanel()
        }
    }

    private func showPanel() {
        guard let button = statusItem.button, let buttonWindow = button.window else { return }

        let buttonFrame = buttonWindow.convertToScreen(button.convert(button.bounds, to: nil))
        let screen = buttonWindow.screen ?? NSScreen.main
        let visible = screen?.visibleFrame ?? .zero

        var x = buttonFrame.midX - panelWidth / 2
        x = min(max(x, visible.minX + 8), visible.maxX - panelWidth - 8)
        var y = buttonFrame.minY - contentHeight - 6
        y = max(y, visible.minY + 8)

        panel.setFrame(
            NSRect(x: x, y: y, width: panelWidth, height: contentHeight),
            display: true
        )
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        startOutsideMonitor()
    }

    private func hidePanel() {
        panel.orderOut(nil)
        stopMonitors()
    }

    @objc private func appDidResignActive() {
        if panel.isVisible { hidePanel() }
    }

    // MARK: - 关闭手势

    private func startOutsideMonitor() {
        stopMonitors()
        // 点击别的 App / 桌面 → 收起
        outsideMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown]
        ) { [weak self] _ in
            self?.hidePanel()
        }
        // Esc → 收起
        escapeMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 {
                self?.hidePanel()
                return nil
            }
            return event
        }
    }

    private func stopMonitors() {
        if let outsideMonitor {
            NSEvent.removeMonitor(outsideMonitor)
            self.outsideMonitor = nil
        }
        if let escapeMonitor {
            NSEvent.removeMonitor(escapeMonitor)
            self.escapeMonitor = nil
        }
    }
}
