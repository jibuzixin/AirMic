import Foundation

/// 磁铁库 + 预案的持久化。
///
/// 配置的**编辑入口在手机端**，但**以电脑端为准** —— 磁贴按下要在电脑上执行，
/// 电脑必须知道键位。手机端连上后推一次全量，之后每次改动推一次。
public struct AirMicConfig: Codable, Equatable {
    public var magnets: [Magnet]
    public var presets: [Preset]
    public var revision: Int
    /// 电脑端选中的音频输出（虚拟）设备 id
    public var outputDeviceId: String
    /// 抖动缓冲（毫秒）
    public var bufferMs: Int
    /// 静默多少秒后自动停止收音（0 = 不自动关）
    public var silenceSeconds: Int?

    public static var empty: AirMicConfig {
        AirMicConfig(magnets: [], presets: [], revision: 0, outputDeviceId: "", bufferMs: 60)
    }

    public init(
        magnets: [Magnet] = [],
        presets: [Preset] = [],
        revision: Int = 0,
        outputDeviceId: String = "",
        bufferMs: Int = 60,
        silenceSeconds: Int? = 10
    ) {
        self.magnets = magnets
        self.presets = presets
        self.revision = revision
        self.outputDeviceId = outputDeviceId
        self.bufferMs = bufferMs
        self.silenceSeconds = silenceSeconds
    }
}

/// 配置文件存储。原子写入，避免写一半断电损坏文件。
public final class ConfigStore {
    private let fileURL: URL

    public init(directory: URL? = nil) {

        let base = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AirMic", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        fileURL = base.appendingPathComponent("config.json")
    }

    private(set) var config: AirMicConfig = .empty

    /// 读盘；文件不存在或损坏时返回空配置（不猜数据）
    public func load() -> AirMicConfig {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode(AirMicConfig.self, from: data)
        else {
            config = .empty
            return config
        }
        config = Self.migrate(decoded)
        return config
    }

    /// 保存。返回是否写成功。
    @discardableResult
    public func save(_ newConfig: AirMicConfig) -> Bool {
        config = newConfig
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(newConfig) else { return false }
        do {
            try data.write(to: fileURL, options: .atomic)
            return true
        } catch {
            Log.error("配置写入失败：\(error.localizedDescription)")
            return false
        }
    }

    /// 应用手机端推来的全量配置
    @discardableResult
    public func apply(magnets: [Magnet], presets: [Preset]) -> AirMicConfig {
        var next = config
        next.magnets = magnets
        next.presets = sanitize(presets: presets, magnets: magnets)
        next.revision = config.revision + 1
        save(next)
        return next
    }

    /// 旧版本配置迁移：单个 appId → appIds
    static func migrate(_ input: AirMicConfig) -> AirMicConfig {
        var next = input
        next.presets = next.presets.map { preset in
            var p = preset
            if p.appIds.isEmpty {
                if let appId = p.appId, !appId.isEmpty {
                    p.appIds = [appId]
                } else if let name = p.appName, !name.isEmpty {
                    // 老配置只有名字，先按名字当 id（桌面端匹配时会兜底按名字比）
                    p.appIds = [name]
                }
            }
            return p
        }
        return next
    }

    /// 删磁铁时把引用它的预案一起清掉，否则磁贴会指向不存在的磁铁。
    public func sanitize(presets: [Preset], magnets: [Magnet]) -> [Preset] {
        let ids = Set(magnets.map(\.id))
        var result = presets.map { preset in
            var p = preset
            if let press = p.micPressId, !ids.contains(press) { p.micPressId = nil }
            if let release = p.micReleaseId, !ids.contains(release) { p.micReleaseId = nil }
            if let hold = p.micHoldId, !ids.contains(hold) { p.micHoldId = nil }
            p.tiles = p.tiles.filter { ids.contains($0.magnetId) }
            return p
        }
        // 必须恰好有一个默认预案
        let defaults = result.filter(\.isDefaultPreset)
        if defaults.isEmpty, let first = result.first {
            result[result.firstIndex(of: first)!].isDefault = true
        } else if defaults.count > 1 {
            for index in result.indices where result[index].isDefaultPreset && result[index].id != defaults[0].id {
                result[index].isDefault = false
            }
        }
        return result
    }
}
