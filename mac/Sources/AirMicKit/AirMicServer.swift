import AppKit
import CoreAudio
import Foundation
import Combine

/// 一台设备请求配对
public struct PairingRequestInfo: Equatable, Identifiable {
    public var id: String { deviceId }
    public var deviceId: String
    public var deviceName: String
    public var model: String

    public var displayName: String { deviceName.isEmpty ? model : deviceName }
}

/// 电脑端服务端：把控制通道、协议、配对、预案切换、快捷键执行串起来。
///
/// UI 层（SwiftUI 菜单栏面板）只读这里的状态、调这里的方法，
/// 不直接碰网络。
///
/// ⚠️ **它是一个全局单例**（`shared`）。服务端必须活到 App 结束 ——
/// 之前挂在 SwiftUI 的 `@StateObject` 上时，对象会在场景安装前被释放，
/// 表现为「端口在监听，但连接进来没人应答」。
public final class AirMicServer: ObservableObject {

    /// 全局唯一的服务端
    public static let shared = AirMicServer()

    private let control = ControlServer(serviceName: HostInfo.displayName, txtRecord: [:])
    private let pairingStore = PairingStore()
    private let configStore = ConfigStore()
    private let foregroundWatcher = ForegroundAppWatcher()
    private let hotkeyExecutor = HotkeyExecutor()
    /// 音频管线：解码 → 写进虚拟设备
    private let audioWriter = VirtualAudioWriter()
    private var audioDecoder: AacDecoder?
    private var audioReceiver: AudioReceiver?
    private var statsTimer: Timer?

    /// 电脑端的稳定设备 id（Bonjour TXT 里带的那串）
    public let deviceId: String

    public private(set) var config: AirMicConfig = AirMicConfig.empty

    // MARK: 面板要看的状态（都是 @Published，界面自动刷新）

    @Published public private(set) var pairedDevices: [PairedDevice] = []
    @Published public private(set) var pendingRequests: [PairingRequestInfo] = []
    @Published public private(set) var foregroundApp: ForegroundApp
    /// 电脑端是否正在收音（把手机的音频写进虚拟设备）
    @Published public private(set) var isRecording = false
    @Published public private(set) var activePreset: Preset?
    /// 手机端上报的麦克风状态
    @Published public private(set) var phoneMicMode: MicMode = .idle
    @Published public private(set) var stats: Stats = .empty
    /// 观察到的电脑前台应用集合（手机端配预案时列出来）
    @Published public private(set) var knownApps: [String] = []
    /// 电脑端见过的所有应用（带 id，手机端拉走去绑预案）
    @Published public private(set) var knownAppList: [KnownApp] = []

    /// 菜单栏图标要不要显示铃铛（有待处理的配对请求时）
    public var hasPendingPairRequest: Bool { !pendingRequests.isEmpty }
    /// 当前配对码（刷新后旧码立刻失效）
    @Published public private(set) var pairCodeValue: String = ""
    /// 配对码剩余有效秒数
    @Published public private(set) var pairCodeRemaining: Int = 0
    /// 面板上显示的设备名（连上手机后是手机名）
    @Published public private(set) var connectedPhoneName: String?
    /// 出错信息（面板上显示一行提示）
    @Published public private(set) var lastError: String?

    public private(set) var connectedClient: ClientConnection?

    public let pairCode = PairingCode()

    /// 开发期用：自动同意配对请求（生产版永远是 false）
    public var autoApprovePairing = false

    public init(deviceId: String = HostInfo.stableId) {
        self.deviceId = deviceId
        self.foregroundApp = ForegroundApp(name: "访达", bundleId: "com.apple.finder")
        control.onMessage = { [weak self] message, client in
            self?.handle(message, from: client)
        }
        control.onClientChange = { [weak self] connected in
            guard let self else { return }
            if !connected {
                self.connectedClient = nil
                self.onMain { self.connectedPhoneName = nil }
            }
        }
        foregroundWatcher.onChange = { [weak self] app in
            self?.handleForegroundChange(app)
        }
    }

    // MARK: - 生命周期

    public func start() throws {
        config = configStore.load()
        pairedDevices = pairingStore.allDevices()
        foregroundApp = foregroundWatcher.current
        pairCodeValue = pairCode.code
        pairCodeRemaining = pairCode.remainingSeconds

        // Bonjour TXT：手机端扫描时能看到名字、id、版本
        control.setTXTRecord([
            "id": deviceId,
            "name": HostInfo.displayName,
            "v": String(ProtocolVersion.current),
            "state": isRecording ? "recording" : "idle",
        ])
        try control.start()
        foregroundWatcher.start()
        startStatsTimer()

        if let preset = defaultPreset() {
            activePreset = preset
        }
        Log.info("AirMic 服务端已启动")
    }

    public func stop() {
        foregroundWatcher.stop()
        control.stop()
        statsTimer?.invalidate()
        statsTimer = nil
    }

    /// 每秒把音频管线的统计回写到面板
    private func startStatsTimer() {
        statsTimer?.invalidate()
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            guard let self, let receiver = self.audioReceiver else { return }
            let snapshot = receiver.stats(bufferMs: self.config.bufferMs)
            self.onMain { self.stats = snapshot }

            // 诊断行：一眼看出卡在哪一环
            //   recv=0        → 音频包根本没到电脑（手机/网络）
            //   decoded=0     → 包到了但解不出来
            //   rendered=0    → 解出来了但没写进设备
            let debug = self.audioOutputDebug
            Log.info(String(
                format: "[AUDIO] recv=%d lost=%d decoded=%.1fs empty=%d rendered=%.1fs peak=%.2f queued=%d underrun=%d",
                receiver.receivedPackets,
                receiver.lostPackets,
                Double(receiver.decodedFrames) / 48000.0,
                receiver.emptyDecodes,
                Double(debug.renderedFrames) / 48000.0,
                debug.peak,
                debug.queued,
                debug.underruns
            ))
        }
        // 放到主运行循环上（面板要看到它）
        RunLoop.main.add(timer, forMode: .common)
        statsTimer = timer
    }

    /// 报告一个错误（面板上显示一行提示）
    public func report(error message: String) {
        onMain { self.lastError = message }
        Log.error(message)
    }

    /// 应用启动时调用：启动服务端，失败只记日志（面板会显示错误）
    public func startOnLaunch() {
        do {
            try start()
        } catch {
            report(error: "AirMic 启动失败：\(error.localizedDescription)")
        }
    }

    // MARK: - 对外状态

    public func refreshPairedDevices() {
        pairedDevices = pairingStore.allDevices()
    }

    /// 刷新配对码 —— 旧码立刻失效
    public func refreshPairCode() {
        pairCode.refresh()
        pairCodeValue = pairCode.code
        pairCodeRemaining = pairCode.remainingSeconds
        Log.info("配对码已刷新")
    }

    /// 电脑端主动删除某台设备的配对信息
    public func unpair(deviceId: String) {
        pairingStore.forget(deviceId: deviceId)
        pairedDevices = pairingStore.allDevices()
        if connectedClient != nil {
            // 正在连着这台设备 → 立即断开
            connectedClient?.close()
            connectedClient = nil
        }
        Log.info("已删除设备配对信息：\(deviceId)")
    }

    /// 开始 / 停止收音（面板主按钮）
    public func toggleRecording() {
        isRecording.toggle()
        if isRecording {
            startAudioPipeline()
        } else {
            stopAudioPipeline()
        }
        broadcastState()
        Log.info(isRecording ? "开始收音" : "停止收音")
    }

    // MARK: - 音频管线

    /// 打开音频接收（UDP）+ 虚拟设备写入
    private func startAudioPipeline() {
        stopAudioPipeline()
        do {
            let decoder = try AacDecoder(sampleRate: 48000, channels: 1)
            audioDecoder = decoder

            let receiver = AudioReceiver(
                decoder: decoder,
                writer: audioWriter,
                bufferMs: config.bufferMs
            )
            audioReceiver = receiver
            try receiver.start()

            let deviceID = resolveOutputDeviceID()
            let deviceName = AudioDeviceManager.outputDevices()
                .first { $0.id == String(deviceID) }?.name ?? "未知设备"
            Log.info("音频输出目标：\(deviceName)（id \(deviceID)）")
            try audioWriter.start(deviceID: deviceID)
        } catch {
            Log.error("音频管线启动失败：\(error.localizedDescription)")
            audioReceiver = nil
            audioDecoder = nil
        }
    }

    private func stopAudioPipeline() {
        audioReceiver?.stop()
        audioReceiver = nil
        audioDecoder = nil
        audioWriter.stop()
    }

    /// 面板选的输出设备 id → CoreAudio 设备 id
    private func resolveOutputDeviceID() -> AudioDeviceID {
        if let raw = UInt32(config.outputDeviceId), raw != 0 {
            return AudioDeviceID(raw)
        }
        // 没选就用系统默认输出设备
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var deviceID: AudioDeviceID = 0
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        if AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceID
        ) != noErr {
            return 0
        }
        return deviceID
    }

    /// 面板上的输出设备下拉
    public func setOutputDevice(id: String) {
        config.outputDeviceId = id
        configStore.save(config)
        if isRecording {
            // 换设备要重开写入
            audioWriter.stop()
            try? audioWriter.start(deviceID: resolveOutputDeviceID())
        }
        broadcastState()
    }

    /// 1kHz 测试音开关（排查「电脑听不到声音」用）
    public func setTestTone(_ enabled: Bool) {
        audioWriter.setTestTone(enabled)
        Log.info(enabled ? "1kHz 测试音：开" : "1kHz 测试音：关")
    }

    /// 音频输出的自检数据（写到设备的帧数 / 峰值）
    public var audioOutputDebug: (renderedFrames: Int, peak: Double, queued: Int, underruns: Int) {
        (
            audioWriter.renderedFrames,
            audioWriter.peakAmplitude,
            audioWriter.queuedFrames,
            audioWriter.underrunCount
        )
    }

    public func setBufferMs(_ ms: Int) {
        config.bufferMs = max(10, min(500, ms))
        configStore.save(config)
        broadcastState()
    }

    /// 面板收到「允许 / 拒绝」配对请求
    public func respondToPairing(deviceId: String, approved: Bool) {
        guard let index = pendingRequests.firstIndex(where: { $0.deviceId == deviceId }) else { return }
        let request = pendingRequests.remove(at: index)
        respond(to: request, approved: approved, client: connectedClient)
    }

    /// 真正处理「允许 / 拒绝」
    private func respond(to request: PairingRequestInfo, approved: Bool, client: ClientConnection?) {
        if approved {
            let token = Self.makeToken()
            let device = PairedDevice(
                id: request.deviceId,
                name: request.deviceName,
                model: request.model,
                token: token,
                pairedAt: Date()
            )
            try? pairingStore.remember(device)
            onMain { self.pairedDevices = self.pairingStore.allDevices() }
            var response = Message(type: Message.Kind.pairRespond)
            response.approved = true
            response.token = token
            client?.send(response)
            Log.info("已允许配对：\(request.displayName)")
        } else {
            var response = Message(type: Message.Kind.pairRespond)
            response.approved = false
            client?.send(response)
            Log.info("已拒绝配对：\(request.displayName)")
        }
    }

    // MARK: - 消息处理

    private func handle(_ message: Message, from client: ClientConnection) {
        switch message.type {
        case Message.Kind.hello:
            handleHello(message, client: client)
        case Message.Kind.pairRequest:
            handlePairRequest(message, client: client)
        case Message.Kind.pairCode:
            handlePairCode(message, client: client)
        case Message.Kind.hotkeyExecute:
            guard let combo = message.combo else { return }
            // 没有辅助功能权限时 CGEvent 会被系统静默丢弃 —— 要明确告诉用户
            if !HotkeyExecutor.hasAccessibilityPermission {
                var failure = Message(type: "hotkey.error")
                failure.reason = "电脑端没有「辅助功能」权限，快捷键发不出去。到「系统设置 → 隐私与安全性 → 辅助功能」里打开 AirMic"
                client.send(failure)
                Log.error("快捷键未执行：缺少辅助功能权限")
                return
            }
            // 发给当前前台应用（不然会发到 AirMic 自己头上）
            let target = foregroundApp.pid > 0
                ? NSRunningApplication(processIdentifier: foregroundApp.pid)
                : nil
            if !hotkeyExecutor.execute(combo: combo, target: target) {
                var failure = Message(type: "hotkey.error")
                failure.reason = "这个快捷键在电脑上执行失败了，检查一下按键设置"
                client.send(failure)
            }
        case Message.Kind.configPush, Message.Kind.configUpdate:
            handleConfig(message, client: client)
        case Message.Kind.appsRequest:
            sendAppList(to: client)
        case Message.Kind.appsCurrentRequest:
            sendCurrentApp(to: client)
        case Message.Kind.micStateReport:
            let mode = MicMode(rawValue: message.mode ?? "idle") ?? .idle
            Log.info("手机端麦克风状态：\(mode.rawValue)")
            // 手机停止过后重新开始 → 编码器是新的，解码器也复位一下，
            // 否则可能卡在上一段的 EOF 上（「停了再说话就没声」）
            if phoneMicMode == .idle && mode != .idle {
                audioReceiver?.resetDecoder()
            } else if mode == .idle {
                audioReceiver?.resetDecoder()
            }
            onMain { self.phoneMicMode = mode }
        default:
            Log.debug("收到未识别的消息类型：\(message.type)")
        }
    }

    private func handleHello(_ message: Message, client: ClientConnection) {
        let version = message.protocolVersion ?? 0
        guard version == ProtocolVersion.current else {
            var reject = Message(type: Message.Kind.helloReject)
            reject.reason = "电脑端 AirMic 版本与手机端不一致，请更新电脑端后再连"
            client.send(reject)
            return
        }

        let deviceId = message.deviceId ?? "unknown"
        let token = message.token ?? ""
        let paired = pairingStore.verify(deviceId: deviceId, token: token)

        connectedClient = client
        var welcome = Message(type: Message.Kind.welcome)
        welcome.sessionId = UUID().uuidString
        welcome.pairingRequired = !paired
        welcome.server = currentServerState()
        client.send(welcome)

        if paired {
            // 已配对设备：直接连上，不再请求同意（硬约束 14）
            var state = Message(type: Message.Kind.state)
            state.server = currentServerState()
            client.send(state)
            if let preset = activePreset {
                sendActivePreset(preset, appName: foregroundApp.name, fallback: false)
            }
            onMain { self.connectedPhoneName = message.deviceName ?? deviceId }
            Log.info("已配对设备直接连上：\(message.deviceName ?? deviceId)")
        } else {
            Log.info("未配对设备接入，等待配对：\(message.deviceName ?? deviceId)")
        }
    }

    private func handlePairRequest(_ message: Message, client: ClientConnection) {
        let deviceId = message.deviceId ?? "unknown"
        let info = PairingRequestInfo(
            deviceId: deviceId,
            deviceName: message.deviceName ?? "未知设备",
            model: message.model ?? ""
        )
        if !pendingRequests.contains(where: { $0.deviceId == deviceId }) {
            onMain { self.pendingRequests.append(info) }
        }
        var notify = Message(type: Message.Kind.pairRequestReceived)
        notify.deviceName = info.deviceName
        client.send(notify)
        Log.info("收到配对请求：\(info.displayName)")

        if autoApprovePairing {
            // 开发模式：直接同意，不等请求进队列（否则会竞态）
            respond(to: info, approved: true, client: client)
        }
    }

    private func handlePairCode(_ message: Message, client: ClientConnection) {
        let code = message.code ?? ""
        guard pairCode.consume(code) else {
            var result = Message(type: Message.Kind.pairResult)
            result.ok = false
            result.message = "配对码已过期，在电脑端重新生成一个"
            client.send(result)
            return
        }
        // 配对码校验通过 = 电脑端也记住这台设备，之后点一下就能直连
        let deviceId = message.deviceId ?? "code-\(UUID().uuidString.prefix(8))"
        let token = Self.makeToken()
        let device = PairedDevice(
            id: deviceId,
            name: message.deviceName ?? "已配对设备",
            model: message.model ?? "",
            token: token,
            pairedAt: Date()
        )
        try? pairingStore.remember(device)
        onMain { self.pairedDevices = self.pairingStore.allDevices() }

        var result = Message(type: Message.Kind.pairResult)
        result.ok = true
        result.token = token
        result.message = "已连接"
        client.send(result)
        Log.info("配对码校验通过")
    }

    private func handleConfig(_ message: Message, client: ClientConnection) {
        guard let magnets = message.magnets, let presets = message.presets else { return }
        Log.info("收到配置：磁铁 \(magnets.count) 个，预案 \(presets.count) 套")
        let updated = configStore.apply(magnets: magnets, presets: presets)
        config = updated
        var ack = Message(type: Message.Kind.configAck)
        ack.revision = updated.revision
        client.send(ack)
        // 配置变了，当前预案可能也要重算
        if let preset = activePreset {
            sendActivePreset(preset, appName: foregroundApp.name, fallback: false)
        }
    }

    // MARK: - 前台应用 → 预案

    private func handleForegroundChange(_ app: ForegroundApp) {
        // 忽略 AirMic 自己：打开菜单栏面板时它可能变成「前台应用」，
        // 那样快捷键就会发给它自己，等于没发。
        if app.bundleId == Bundle.main.bundleIdentifier {
            return
        }
        onMain {
            self.foregroundApp = app
            if !self.knownApps.contains(app.name) {
                self.knownApps.append(app.name)
            }
            self.recordApp(app)
        }
        broadcastState()

        // 需求说明书 §4.4：绑了就切过去，没绑就切默认预案
        let currentId = foregroundApp.bundleId.isEmpty ? foregroundApp.name : foregroundApp.bundleId
        let bound = config.presets.first { preset in
            // 先按 id 匹配（重名靠 id 区分），再退回按名字
            if let appId = preset.appId, !appId.isEmpty {
                return appId == currentId
            }
            guard let appName = preset.appName, !appName.isEmpty else { return false }
            return appName.caseInsensitiveCompare(app.name) == .orderedSame
                || appName.caseInsensitiveCompare(app.bundleId) == .orderedSame
        }
        let fallback = defaultPreset()
        let next = bound ?? fallback
        guard let next else { return }

        let isFallback = bound == nil
        if activePreset?.id != next.id {
            onMain { self.activePreset = next }
            sendActivePreset(next, appName: app.name, fallback: isFallback)
        }
    }

    /// 记下这个应用（用户需求：电脑端记录每一次打开过的不同应用）
    private func recordApp(_ app: ForegroundApp) {
        // 编号优先用 bundle id；没有就用名字
        let id = app.bundleId.isEmpty ? app.name : app.bundleId
        if let index = knownAppList.firstIndex(where: { $0.id == id }) {
            knownAppList[index].seenCount += 1
            knownAppList[index].lastSeen = Date()
            knownAppList[index].name = app.name
        } else {
            knownAppList.append(
                KnownApp(
                    id: id,
                    name: app.name,
                    bundleId: app.bundleId,
                    seenCount: 1,
                    lastSeen: Date()
                )
            )
        }
    }

    /// 手机端来要应用列表
    private func sendAppList(to client: ClientConnection?) {
        var message = Message(type: Message.Kind.appsList)
        message.appList = knownAppList
        client?.send(message)
    }

    /// 手机端来要「当前前台应用」
    private func sendCurrentApp(to client: ClientConnection?) {
        var message = Message(type: Message.Kind.appsCurrent)
        message.currentApp = KnownApp(
            id: foregroundApp.bundleId.isEmpty ? foregroundApp.name : foregroundApp.bundleId,
            name: foregroundApp.name,
            bundleId: foregroundApp.bundleId,
            seenCount: 1,
            lastSeen: Date()
        )
        client?.send(message)
    }

    private func sendActivePreset(_ preset: Preset, appName: String, fallback: Bool) {
        var message = Message(type: Message.Kind.presetActive)
        message.presetId = preset.id
        message.name = preset.name
        message.appName = appName
        message.fallback = fallback
        control.broadcast(message)
    }

    private func defaultPreset() -> Preset? {
        config.presets.first(where: \.isDefaultPreset) ?? config.presets.first
    }

    // MARK: - 广播

    private func currentServerState() -> ServerState {
        ServerState(
            recording: isRecording,
            foregroundApp: foregroundApp.name,
            foregroundBundleId: foregroundApp.bundleId,
            outputDeviceId: config.outputDeviceId,
            bufferMs: config.bufferMs
        )
    }

    private func broadcastState() {
        var message = Message(type: Message.Kind.state)
        message.server = currentServerState()
        control.broadcast(message)
    }

    /// 把状态改动挪到主线程 —— 网络回调在工作线程上，@Published 要在主线程改
    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    // MARK: - 工具

    /// 32 字节随机 token（Base64）
    public static func makeToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString()
    }
}
