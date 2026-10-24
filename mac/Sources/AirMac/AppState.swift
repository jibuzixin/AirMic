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
    var outputDeviceId: String { server.config.outputDeviceId }
    var bufferMs: Int { server.config.bufferMs }

    /// 可选的音频输出设备（面板下拉）
    @Published private(set) var devices: [AudioDevice] = []
    /// 1kHz 测试音开关
    @Published var testToneOn = false

    // MARK: - 动作

    func start() {
        do {
            try server.start()
        } catch {
            server.report(error: "AirMic 启动失败：\(error.localizedDescription)")
        }
        refreshDevices()
    }

    /// 重新枚举音频输出设备
    func refreshDevices() {
        devices = AudioDeviceManager.outputDevices()
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
