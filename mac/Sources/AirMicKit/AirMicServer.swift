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
    /// 文本磁片：把提前编辑好的文字粘贴到前台应用
    private lazy var textPaster = TextPaster(hotkeyExecutor: hotkeyExecutor)
    /// 音频管线：解码 → 写进虚拟设备
    private let audioWriter = VirtualAudioWriter()
    private var audioDecoder: AacDecoder?
    private var audioReceiver: AudioReceiver?
    private var statsTimer: Timer?
    private var pingCounter = 0

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
    /// 面板上显示的设备名（连上手机后是手机名）
    @Published public private(set) var connectedPhoneName: String?
    /// 出错信息（面板上显示一行提示）
    @Published public private(set) var lastError: String?

    public private(set) var connectedClient: ClientConnection?
    /// 已经用 token 认证过的连接（这些连接再发配对请求就是多余的）
    private var authenticatedClients = Set<String>()


    /// 开发期用：自动同意配对请求（生产版永远是 false）
    public var autoApprovePairing = false
    /// 启动时自动开始收音（菜单栏 App 打开这个，CLI 不打开）
    public var autoRecordOnLaunch = false

    /// 这次收音是什么时候开始的（没收到包时用它算静默）
    private var recordingStartedAt: Date?
    /// 收音是被用户手动关掉的吗（静默自动关 = false）
    private var recordingStoppedByUser = false
    /// 网络往返延迟（ping/pong，手机端回显时间戳）
    private var rttMs: Double?

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
                self.rttMs = nil
                // 手机断线时把可能还按着的组合键松开，否则电脑上会一直卡住。
                // 走主队列，和按下操作保持先后顺序。
                self.onMain {
                    self.hotkeyExecutor.release()
                    self.connectedPhoneName = nil
                }
            }
        }
        foregroundWatcher.onChange = { [weak self] app in
            self?.handleForegroundChange(app)
        }
    }

    // MARK: - 生命周期

    public func start() throws {
        config = configStore.load()
        silenceSecondsValue = config.silenceSeconds ?? 30
        pairedDevices = pairingStore.allDevices()
        foregroundApp = foregroundWatcher.current

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
        if autoRecordOnLaunch {
            setRecording(true)
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
            guard let self else { return }

            // 心跳：收音时 2 秒一次，空转时 10 秒一次。
            // 手机端原生层会直接回 pong（WebView 后台挂起也不影响），
            // 既保持 TCP 活跃，又不会为了 RTT 数字频繁唤醒 Wi-Fi。
            self.pingCounter += 1
            let pingPeriod = self.isRecording ? 2 : 10
            if self.pingCounter % pingPeriod == 0, let client = self.connectedClient {
                var ping = Message(type: Message.Kind.ping)
                ping.t = Int64(Date().timeIntervalSince1970 * 1000)
                client.send(ping)
            }

            guard let receiver = self.audioReceiver else { return }
            var snapshot = receiver.stats(bufferMs: self.config.bufferMs)
            // 延迟用网络往返（真实可测），没有就是 nil → 界面显示 [--]
            snapshot.latencyMs = self.rttMs
            // 欠载对用户没有参考价值（没说话时它只会一直涨），不展示
            snapshot.underruns = nil
            self.onMain { self.stats = snapshot }

            // 诊断行：一眼看出卡在哪一环
            //   recv=0        → 音频包根本没到电脑（手机/网络）
            //   decoded=0     → 包到了但解不出来
            //   rendered=0    → 解出来了但没写进设备
            // 静默自动关闭：一段时间没有任何音频包就停止收音（省电）
            let silence = self.silenceSeconds
            if silence > 0, self.isRecording {
                let last = receiver.lastPacketAt ?? self.recordingStartedAt ?? Date()
                if Date().timeIntervalSince(last) >= Double(silence) {
                    Log.info("静默超过 \(silence)s，自动停止收音")
                    self.setRecording(false)
                }
            }

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
        setRecording(!isRecording, byUser: true)
    }

    /// 设定收音开关（自动开麦 / 静默关闭都走这里）
    ///
    /// - Parameter byUser: true = 用户手动点按钮关的；false = 静默自动关的。
    ///   手机端据此决定「要不要提醒电脑没有在收音」。
    public func setRecording(_ on: Bool, byUser: Bool = false) {
        guard isRecording != on else { return }
        isRecording = on
        if on {
            recordingStoppedByUser = false
            recordingStartedAt = Date()
            startAudioPipeline()
        } else {
            recordingStoppedByUser = byUser
            recordingStartedAt = nil
            stopAudioPipeline()
        }
        broadcastState()
        Log.info(on ? "开始收音" : "停止收音")
    }

    /// 静默自动关闭的秒数（0 = 关闭）
    @Published public private(set) var silenceSecondsValue: Int = 30

    public var silenceSeconds: Int { silenceSecondsValue }

    public func setSilenceSeconds(_ seconds: Int) {
        let value = max(0, min(600, seconds))
        config.silenceSeconds = value
        configStore.save(config)
        silenceSecondsValue = value
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
        case Message.Kind.hotkeyExecute:
            guard let combo = message.combo else { return }
            guard requireAccessibility(client: client) else { return }
            // 统一在主线程按消息顺序执行：文本粘贴用 NSPasteboard，必须在主线程；
            // 快捷键也走同一条主队列，保证磁片组里「文本 → 按键」的顺序不会乱。
            onMain { [weak self] in
                guard let self else { return }
                if !self.hotkeyExecutor.execute(combo: combo, target: self.targetApplication()) {
                    self.sendHotkeyError(client: client, reason: "这个快捷键在电脑上执行失败了，检查一下按键设置")
                }
            }
        case Message.Kind.hotkeyDown:
            // 长按语义：按下组合键，等 hotkey.up 才松开
            guard let combo = message.combo else { return }
            guard requireAccessibility(client: client) else { return }
            onMain { [weak self] in
                guard let self else { return }
                if !self.hotkeyExecutor.press(combo: combo, target: self.targetApplication()) {
                    self.sendHotkeyError(client: client, reason: "这个快捷键在电脑上执行失败了，检查一下按键设置")
                }
            }
        case Message.Kind.hotkeyUp:
            guard requireAccessibility(client: client) else { return }
            onMain { [weak self] in
                self?.hotkeyExecutor.release()
            }
        case Message.Kind.textPaste:
            // 文本磁片：把一段文字粘贴到前台应用
            guard let text = message.text, !text.isEmpty else { return }
            guard requireAccessibility(client: client) else { return }
            onMain { [weak self] in
                guard let self else { return }
                if !self.textPaster.paste(text, target: self.targetApplication()) {
                    self.sendHotkeyError(client: client, reason: "这段文本没能在电脑上粘贴出来，检查一下辅助功能权限")
                }
            }
        case Message.Kind.configPush, Message.Kind.configUpdate:
            handleConfig(message, client: client)
        case Message.Kind.appsRequest:
            sendAppList(to: client)
        case Message.Kind.appsCurrentRequest:
            sendCurrentApp(to: client)
        case Message.Kind.ping:
            // 手机回到前台时主动做一次健康检查：原样回时间戳
            if let sent = message.t {
                var pong = Message(type: Message.Kind.pong)
                pong.t = sent
                client.send(pong)
            }
        case Message.Kind.pong:
            if let sent = message.t {
                let now = Int64(Date().timeIntervalSince1970 * 1000)
                let rtt = Double(max(0, now - sent))
                rttMs = rttMs.map { $0 * 0.7 + rtt * 0.3 } ?? rtt
            }
        case Message.Kind.micStateReport:
            let mode = MicMode(rawValue: message.mode ?? "idle") ?? .idle
            Log.info("手机端麦克风状态：\(mode.rawValue)")
            // 手机开始说话了：
            //   - 静默自动关的收音 → 自动恢复（省电机制不该变成负担）
            //   - **用户手动关的** → 不恢复，必须用户自己再点开始
            if mode != .idle, !isRecording, !recordingStoppedByUser {
                Log.info("手机端开始收音，自动恢复电脑端收音")
                onMain { self.setRecording(true) }
            }
            // 手机停止过后重新开始 → 编码器是新的，解码器也复位一下，
            // 否则可能卡在上一段的 EOF 上（「停了再说话就没声」）
            if phoneMicMode == .idle && mode != .idle {
                audioReceiver?.resetDecoder()
            } else if mode == .idle {
                audioReceiver?.resetDecoder()
                // 兜底：长按的「松开」如果没收到，手机停止收音时强制松开
                hotkeyExecutor.release()
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
        welcome.features = ["ping"]
        client.send(welcome)

        if paired {
            authenticatedClients.insert(client.id)
            // 之前可能残留过这条设备的配对请求 —— 已经配对了就清掉
            onMain { self.pendingRequests.removeAll { $0.deviceId == deviceId } }
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

        // 1) 这条连接已经用 token 认证过 —— 不该再来配对，直接忽略
        if authenticatedClients.contains(client.id) {
            Log.info("忽略已认证连接的配对请求：\(deviceId)")
            return
        }
        // 2) 这台设备本来就在已配对列表里：直接回已有的 token，不打扰用户
        if let existing = pairingStore.device(for: deviceId) {
            var response = Message(type: Message.Kind.pairRespond)
            response.approved = true
            response.token = existing.token
            client.send(response)
            Log.info("设备已在配对列表里，直接放行：\(existing.displayName)")
            return
        }
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

    private func handleConfig(_ message: Message, client: ClientConnection) {
        guard let magnets = message.magnets, let presets = message.presets else { return }
        Log.info("收到配置：磁铁 \(magnets.count) 个，预案 \(presets.count) 套")
        let updated = configStore.apply(magnets: magnets, presets: presets)
        config = updated
        var ack = Message(type: Message.Kind.configAck)
        ack.revision = updated.revision
        client.send(ack)
        // 配置变了，按当前前台应用重算一遍预案 ——
        // 否则刚在手机上绑好应用，电脑端还拿着旧预案，切应用不会有变化。
        recomputeActivePreset()
    }

    // MARK: - 前台应用 → 预案

    /// 按当前前台应用重算预案并广播
    private func recomputeActivePreset() {
        let currentId = foregroundApp.bundleId.isEmpty
            ? foregroundApp.name
            : foregroundApp.bundleId
        let bound = config.presets.first { preset in
            if preset.appIds.contains(currentId) { return true }
            if let appId = preset.appId, !appId.isEmpty, appId == currentId { return true }
            guard let appName = preset.appName, !appName.isEmpty else { return false }
            return appName.caseInsensitiveCompare(foregroundApp.name) == .orderedSame
                || appName.caseInsensitiveCompare(foregroundApp.bundleId) == .orderedSame
        }
        guard let next = bound ?? defaultPreset() else { return }
        let isFallback = bound == nil
        let changed = activePreset?.id != next.id
        if changed {
            onMain { self.activePreset = next }
            sendActivePreset(next, appName: foregroundApp.name, fallback: isFallback)
        }
    }

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
        recomputeActivePreset()
    }

    /// 当前要接收快捷键的应用（不给 AirMic 自己）
    private func targetApplication() -> NSRunningApplication? {
        guard foregroundApp.pid > 0 else { return nil }
        return NSRunningApplication(processIdentifier: foregroundApp.pid)
    }

    /// 检查辅助功能权限；没有就回一条错误
    private func requireAccessibility(client: ClientConnection) -> Bool {
        guard HotkeyExecutor.hasAccessibilityPermission else {
            sendHotkeyError(
                client: client,
                reason: "电脑端没有「辅助功能」权限，快捷键发不出去。到「系统设置 → 隐私与安全性 → 辅助功能」里打开 AirMic"
            )
            Log.error("快捷键未执行：缺少辅助功能权限")
            return false
        }
        return true
    }

    private func sendHotkeyError(client: ClientConnection, reason: String) {
        var failure = Message(type: "hotkey.error")
        failure.reason = reason
        client.send(failure)
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
            bufferMs: config.bufferMs,
            stoppedByUser: recordingStoppedByUser
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
