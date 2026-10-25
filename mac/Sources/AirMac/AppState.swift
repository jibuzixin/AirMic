import AirMicKit
import AppKit
import Combine
import Foundation

/// 面板状态层。
///
/// 服务端是**全局单例**（`AirMicServer.shared`）—— 它必须活到 App 结束，
/// 不能挂在 SwiftUI 的对象生命周期上（之前挂在 `@StateObject` 上时，
/// 场景还没安装对象就被释放，表现为「端口在监听但没人应答」）。
///
/// 这里只是把服务端的发布转发给界面，并集中放面板要调的动作。
@MainActor
final class AppState: ObservableObject {
    let server = AirMicServer.shared

    private var cancellables = Set<AnyCancellable>()

    init() {
        server.objectWillChange
            .sink { [weak self] in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }

    // MARK: - 状态（转发自服务端）

    var pairedDevices: [PairedDevice] { server.pairedDevices }
    var pendingRequests: [PairingRequestInfo] { server.pendingRequests }
    var foregroundApp: ForegroundApp { server.foregroundApp }
    var isRecording: Bool { server.isRecording }
    var connectedPhoneName: String? { server.connectedPhoneName }
    var stats: Stats { server.stats }
    var activePresetName: String? { server.activePreset?.name }
    var foregroundAppName: String { server.foregroundApp.name }
    /// 菜单栏图标：有待处理的配对请求时显示铃铛
    var hasPendingPairRequest: Bool { server.hasPendingPairRequest }
    var outputDeviceId: String { server.config.outputDeviceId }
    var bufferMs: Int { server.config.bufferMs }

    /// 可选的音频输出设备（面板下拉）
    @Published private(set) var devices: [AudioDevice] = []
    /// 辅助功能权限（定时自检，用户授权后提示会自动消失）
    @Published private(set) var accessibilityGranted = HotkeyExecutor.hasAccessibilityPermission
    /// 用户点了「去授权」后的引导状态
    @Published var accessibilityHintShown = false
    /// 「诊断日志已复制」的短暂提示
    @Published var diagnosticsCopied = false

    // MARK: - 动作

    /// 服务端由 `AirMicServer.shared.startOnLaunch()` 在 App 启动时拉起，
    /// 这里**不要**再 start 一遍（会撞端口）。
    private var permissionTimer: Timer?

    func start() {
        refreshDevices()
        // 周期性自检：用户在系统设置里打开开关后，提示要自动消失
        permissionTimer?.invalidate()
        let timer = Timer(timeInterval: 1.5, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.recheckAccessibility() }
        }
        RunLoop.main.add(timer, forMode: .common)
        permissionTimer = timer
    }

    /// 重新枚举音频输出设备
    func refreshDevices() {
        devices = AudioDeviceManager.outputDevices()
        // 没选过、或者选的那个设备不见了 → 挑一个合理的默认值
        let stillThere = devices.contains { $0.id == outputDeviceId }
        if !stillThere {
            // 优先选虚拟设备（BlackHole 之类）—— 那才是「当麦克风用」的目标
            let preferred = devices.first { $0.isVirtual } ?? devices.first
            if let preferred {
                selectOutputDevice(preferred.id)
            }
        }
    }

    /// 电脑端有没有辅助功能权限（没有的话快捷键发不出去）
    var hasAccessibilityPermission: Bool { accessibilityGranted }

    /// 请求辅助功能权限，并打开系统设置里对应的那一页
    func requestAccessibilityPermission() {
        HotkeyExecutor.requestAccessibilityPermission()
        accessibilityHintShown = true
        if let url = URL(
            string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        ) {
            NSWorkspace.shared.open(url)
        }
        recheckAccessibility()
    }

    /// 重新检查一次权限（也由定时器调用）
    func recheckAccessibility() {
        let granted = HotkeyExecutor.hasAccessibilityPermission
        if granted != accessibilityGranted {
            accessibilityGranted = granted
        }
    }

    /// 面板上的输出设备下拉
    func selectOutputDevice(_ id: String) {
        server.setOutputDevice(id: id)
    }

    /// 抖动缓冲
    func setBuffer(_ ms: Int) {
        server.setBufferMs(ms)
    }

    /// 把诊断日志复制到剪贴板（直接粘给开发看）
    func copyDiagnostics() {
        let report = Diag.report()
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(report, forType: .string)
        Log.info("诊断报告已复制到剪贴板")
        diagnosticsCopied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.diagnosticsCopied = false
        }
    }

    /// 打开日志所在文件夹
    func openLogFolder() {
        NSWorkspace.shared.open(Diag.logDirectory)
    }

    /// 清空日志（重新测一遍时用，避免旧记录干扰）
    func clearDiagnostics() {
        Diag.clear()
        diagnosticsCopied = false
    }

    func toggleRecording() {
        server.toggleRecording()
    }

    func respond(to request: PairingRequestInfo, approved: Bool) {
        server.respondToPairing(deviceId: request.deviceId, approved: approved)
    }

    func unpair(_ device: PairedDevice) {
        server.unpair(deviceId: device.id)
    }

    func quit() {
        server.stop()
        NSApplication.shared.terminate(nil)
    }
}
