import Foundation

/// 控制通道的协议版本。两端不一致时手机端会收到 `hello.reject`。
public enum ProtocolVersion {
    public static let current = 1
}

/// 控制通道上传输的一条消息。
///
/// 用「一个大结构体 + 可选字段」而不是 enum，是为了让手机端（Kotlin / JS）
/// 加字段时不破坏兼容性：老版本手机不发某个字段，就当没有。
public struct Message: Codable, Equatable {
    public var type: String
    public var id: String?

    // hello / welcome
    public var protocolVersion: Int?
    public var deviceId: String?
    public var deviceName: String?
    public var model: String?
    public var token: String?
    public var sessionId: String?
    public var pairingRequired: Bool?
    public var server: ServerState?

    // 配对
    public var code: String?
    public var approved: Bool?
    public var ok: Bool?
    public var message: String?
    public var reason: String?

    // 状态
    public var recording: Bool?
    public var foregroundApp: String?
    public var foregroundBundleId: String?
    public var outputDeviceId: String?
    public var bufferMs: Int?
    public var mode: String?
    public var presetId: String?
    public var name: String?
    public var appName: String?
    public var fallback: Bool?
    public var stats: Stats?

    // 快捷键
    public var combo: [String]?

    // 配置
    public var magnets: [Magnet]?
    public var presets: [Preset]?
    public var revision: Int?

    // 电脑端观察到的前台应用集合（手机端配预案时要用）
    public var apps: [String]?
    /// 应用列表（带 id，重名靠 id 区分）
    public var appList: [KnownApp]?
    /// 当前前台应用
    public var currentApp: KnownApp?

    public init(type: String) {

        self.type = type
    }

    // MARK: 消息类型

    public enum Kind {
        static let hello = "hello"
        static let welcome = "welcome"
        static let helloReject = "hello.reject"

        static let pairRequest = "pair.request"
        static let pairRequestReceived = "pair.request.recv"
        static let pairRespond = "pair.respond"
        static let pairCode = "pair.code"
        static let pairResult = "pair.result"

        static let state = "state"
        static let presetActive = "preset.active"
        static let stats = "stats"
        static let micState = "mic.state"

        static let configPush = "config.push"
        static let configUpdate = "config.update"
        static let configAck = "config.ack"

        static let hotkeyExecute = "hotkey.execute"
        static let micStateReport = "mic.state.report"

        static let appsRequest = "apps.request"
        static let appsList = "apps.list"
        static let appsCurrentRequest = "apps.current.request"
        static let appsCurrent = "apps.current"
    }
}

/// JSON Lines 编解码：每行一个 JSON 对象。
public enum JSONLines {
    /// 单行最大字节数，防止恶意/损坏的长度把内存吃光
    public static let maxLineBytes = 64 * 1024

    public static func encode(_ message: Message) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        var data = try encoder.encode(message)
        data.append(0x0A) // '\n'
        return data
    }

    public static func decode(_ data: Data) throws -> Message {
        try JSONDecoder().decode(Message.self, from: data)
    }
}
