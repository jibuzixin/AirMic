import Foundation

/// 电脑端记住的一台已配对设备。
public struct PairedDevice: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var model: String
    /// 长期 token（一次性配对换来的）
    public var token: String
    public var pairedAt: Date

    public init(id: String, name: String, model: String, token: String, pairedAt: Date) {
        self.id = id
        self.name = name
        self.model = model
        self.token = token
        self.pairedAt = pairedAt
    }

    /// 列表里展示的名字
    public var displayName: String { name.isEmpty ? model : name }
}

/// 配对信息的持久化。
///
/// ⚠️ **为什么不是钥匙串**：钥匙串里的条目属于「创建它的那个程序」。
/// 未签名 / ad-hoc 签名的构建之间互相读会触发系统授权弹窗，并且**阻塞**读取 ——
/// 开发期表现为「连上了但不回话」。所以这里用文件存储（权限 0600）。
/// 等有了稳定的开发者签名，再换回钥匙串（`KeychainStore` 的位置留着）。
public final class PairingStore {
    private let fileURL: URL
    private var cache: [String: PairedDevice]?

    public init(directory: URL? = nil) {
        let base = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AirMic", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        fileURL = base.appendingPathComponent("pairing.json")
    }

    /// 读盘（带内存缓存）
    private var devices: [String: PairedDevice] {
        if let cache { return cache }
        let loaded: [String: PairedDevice]
        if let data = try? Data(contentsOf: fileURL),
           let decoded = try? JSONDecoder().decode([String: PairedDevice].self, from: data) {
            loaded = decoded
        } else {
            loaded = [:]
        }
        cache = loaded
        return loaded
    }

    /// 写盘
    private func persist(_ newValue: [String: PairedDevice]) {
        cache = newValue
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(newValue) else { return }
        try? data.write(to: fileURL, options: .atomic)
        // 只有本人可读
        try? FileManager.default.setAttributes(
            [.posixPermissions: 0o600], ofItemAtPath: fileURL.path
        )
    }

    // MARK: - 已配对设备

    /// 记住某台设备（含 token）
    public func remember(_ device: PairedDevice) throws {
        var current = devices
        current[device.id] = device
        persist(current)
    }

    /// 取回某台设备；没有则返回 nil
    public func device(for id: String) -> PairedDevice? {
        devices[id]
    }

    /// 校验 token 是否有效
    public func verify(deviceId: String, token: String) -> Bool {
        guard let device = devices[deviceId] else { return false }
        return device.token == token && !device.token.isEmpty
    }

    /// 电脑端删除某台设备的配对信息（删完它下次必须重新配对）
    public func forget(deviceId: String) {
        var current = devices
        current.removeValue(forKey: deviceId)
        persist(current)
    }

    /// 所有已配对的设备
    public func allDevices() -> [PairedDevice] {
        devices.values.sorted { $0.pairedAt > $1.pairedAt }
    }

    enum PairingError: LocalizedError {
        case encoding(String)

        var errorDescription: String? {
            switch self {
            case .encoding(let detail): return "配对信息保存失败：\(detail)"
            }
        }
    }
}
