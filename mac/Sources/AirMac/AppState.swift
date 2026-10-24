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
    var pairCode: String { server.pairCodeValue }
    var activePresetName: String? { server.activePreset?.name }
    var foregroundAppName: String { server.foregroundApp.name }
    /// 菜单栏图标：有待处理的配对请求时显示铃铛
    var hasPendingPairRequest: Bool { server.hasPendingPairRequest }
    var outputDeviceId: String { server.config.outputDeviceId }
    var bufferMs: Int { server.config.bufferMs }

    /// 可选的音频输出设备（面板下拉）
    @Published private(set) var devices: [AudioDevice] = []
    /// 1kHz 测试音开关
    @Published var testToneOn = false

    // MARK: - 动作

    /// 服务端由 `AirMicServer.shared.startOnLaunch()` 在 App 启动时拉起，
    /// 这里**不要**再 start 一遍（会撞端口）。
    func start() {
        refreshDevices()
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
    var hasAccessibilityPermission: Bool {
        HotkeyExecutor.hasAccessibilityPermission
    }

    /// 请求辅助功能权限
    func requestAccessibilityPermission() {
        HotkeyExecutor.requestAccessibilityPermission()
    }

    /// 面板上的输出设备下拉
    func selectOutputDevice(_ id: String) {
        server.setOutputDevice(id: id)
    }

    /// 抖动缓冲
    func setBuffer(_ ms: Int) {
        server.setBufferMs(ms)
    }

    func refreshPairCode() {
        server.refreshPairCode()
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
