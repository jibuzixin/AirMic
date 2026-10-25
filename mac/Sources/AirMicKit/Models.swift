import Foundation

// MARK: - 磁铁（快捷键）

/// 磁铁 = 图标 + 名字 + 一组按键。
///
/// 与原型 `src/lib/hotkey.ts` 的 `HotkeyMagnet` **字段一一对应**，
/// 快捷键的「显示串」和「下发串」都是算出来的，不作为字段存 —— 两边不能不一致。
public struct Magnet: Codable, Equatable, Identifiable, Hashable {
    public var id: String
    /// 磁铁的名字，如「语音输入」
    public var label: String
    /// lucide-react 图标名，如 `Mic`
    public var icon: String
    /// 修饰键：cmd / shift / ctrl / alt
    public var modifiers: [String]
    /// 键盘主键；用鼠标键时为 nil
    public var key: String?
    /// 鼠标键：left / right / middle / wheelUp / wheelDown；与键盘主键互斥
    public var mouse: String?

    public init(
        id: String,
        label: String,
        icon: String,
        modifiers: [String],
        key: String? = nil,
        mouse: String? = nil
    ) {
        self.id = id
        self.label = label
        self.icon = icon
        self.modifiers = modifiers
        self.key = key
        self.mouse = mouse
    }

    /// 组合键是否已经配全（没配键的磁铁在界面上是暗态）
    public var hasKey: Bool { mouse != nil || (key != nil && key?.isEmpty == false) }

    /// 显示串，如「⌘⇧V」。没配键返回空串。
    public var display: String {
        let order = ["ctrl": 0, "alt": 1, "shift": 2, "cmd": 3]
        let symbols = ["ctrl": "⌃", "alt": "⌥", "shift": "⇧", "cmd": "⌘"]
        let mods = modifiers
            .filter { symbols[$0] != nil }
            .sorted { (order[$0] ?? 9) < (order[$1] ?? 9) }
            .map { symbols[$0]! }
            .joined()

        if let mouse, !mouse.isEmpty {
            return mods + MouseKey.label(for: mouse)
        }
        guard let key, !key.isEmpty else { return mods }
        return mods + KeyLabel.label(for: key)
    }

    /// 发往 CGEvent 的组合键数组，如 ["cmd", "shift", "v"]
    public var combo: [String] {
        var combo = modifiers
        if let mouse, !mouse.isEmpty {
            combo.append(MouseKey.cgEventName(for: mouse))
        } else if let key, !key.isEmpty {
            combo.append(KeyLabel.cgEventName(for: key))
        }
        return combo
    }
}

/// 键盘主键的显示与 CGEvent 键名映射
public enum KeyLabel {
    /// 显示名（沿用原型 hotkey.ts 的 KEY_CHOICES）
    private static let labels: [String: String] = [
        "space": "Space", "enter": "⏎", "tab": "⇥", "escape": "⎋",
        "backspace": "⌫", "delete": "⌦", "home": "↖", "end": "↘",
        "pageup": "⇞", "pagedown": "⇟",
        "arrowup": "↑", "arrowdown": "↓", "arrowleft": "←", "arrowright": "→",
    ]

    /// CGEvent 用的键名
    private static let cgNames: [String: String] = [
        "space": "space", "enter": "enter", "tab": "tab", "escape": "escape",
        "backspace": "backspace", "delete": "delete", "home": "home", "end": "end",
        "pageup": "pageup", "pagedown": "pagedown",
        "arrowup": "up", "arrowdown": "down", "arrowleft": "left", "arrowright": "right",
    ]

    public static func label(for key: String) -> String {
        if let known = labels[key] { return known }
        if key.count == 1 { return key.uppercased() }
        return key
    }

    public static func cgEventName(for key: String) -> String {
        cgNames[key] ?? key
    }
}

/// 鼠标键的显示与 CGEvent 键名映射
public enum MouseKey {
    public static func label(for key: String) -> String {
        switch key {
        case "left": return "左键"
        case "right": return "右键"
        case "middle": return "中键"
        case "wheelUp": return "滚轮上"
        case "wheelDown": return "滚轮下"
        default: return key
        }
    }

    public static func cgEventName(for key: String) -> String {
        switch key {
        case "left": return "mouse1"
        case "right": return "mouse2"
        case "middle": return "mouse3"
        case "wheelUp": return "wheelup"
        case "wheelDown": return "wheeldown"
        default: return key
        }
    }
}

// MARK: - 预案

/// 电脑端见过的一个应用
///
/// 用户需求：电脑端记录**每一次打开过的不同应用**的名字和编号；
/// 重名时用 id 区分。手机端可以拉这个列表去绑定预案。
public struct KnownApp: Codable, Equatable, Identifiable, Hashable {
    /// 稳定编号（bundle id 优先，否则用名称）
    public var id: String
    /// 应用名
    public var name: String
    /// bundle id
    public var bundleId: String
    /// 见过几次
    public var seenCount: Int
    /// 最后一次见到的时间
    public var lastSeen: Date

    public init(id: String, name: String, bundleId: String, seenCount: Int, lastSeen: Date) {
        self.id = id
        self.name = name
        self.bundleId = bundleId
        self.seenCount = seenCount
        self.lastSeen = lastSeen
    }

    /// 显示用：重名时带编号
    public var displayName: String { name }
}

/// 磁贴 = 对某个磁铁的引用
public struct Tile: Codable, Equatable, Identifiable, Hashable {
    public var id: String
    public var magnetId: String

    public init(id: String, magnetId: String) {
        self.id = id
        self.magnetId = magnetId
    }
}

/// 预案 = 一整套快捷键方案。
///
/// ⚠️ `micPressId` / `micReleaseId` 是「麦克风按钮按下/松开时执行的磁铁」，
/// `tiles` 是**独立**的快捷键磁贴 —— 这是两件不同的事（原型硬约束 10）。
public struct Preset: Codable, Equatable, Identifiable, Hashable {
    public var id: String
    public var name: String
    /// 绑定的应用 id（可以绑多个）；一个应用只会属于一个预案
    public var appIds: [String]
    /// 旧字段：单个应用名（读旧配置时迁移用）
    public var appName: String?
    /// 旧字段：单个应用 id（读旧配置时迁移用）
    public var appId: String?
    /// 麦克风按钮「按下」时执行的磁铁 id
    public var micPressId: String?
    /// 麦克风按钮「松开」时执行的磁铁 id（点按关闭时触发）
    public var micReleaseId: String?
    /// 长按说话时执行的磁铁 id（按下保持、松手释放，与上面两个互相独立）
    public var micHoldId: String?
    /// 独立快捷键磁贴（0–6 个）
    public var tiles: [Tile]
    public var isDefault: Bool?

    public init(
        id: String,
        name: String,
        appIds: [String] = [],
        appName: String? = nil,
        appId: String? = nil,
        micPressId: String? = nil,
        micReleaseId: String? = nil,
        micHoldId: String? = nil,
        tiles: [Tile] = [],
        isDefault: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.appIds = appIds
        self.appName = appName
        self.appId = appId
        self.micPressId = micPressId
        self.micReleaseId = micReleaseId
        self.micHoldId = micHoldId
        self.tiles = tiles
        self.isDefault = isDefault
    }

    public var isDefaultPreset: Bool { isDefault == true }
}

// MARK: - 运行时状态

/// 电脑端当前的前台应用
public struct ForegroundApp: Equatable {
    public var name: String
    public var bundleId: String
    /// 进程 id —— 用来把快捷键发给**正确的那个 app**
    public var pid: pid_t

    public init(name: String, bundleId: String, pid: pid_t = 0) {
        self.name = name
        self.bundleId = bundleId
        self.pid = pid
    }
}

/// 音频管线统计。**拿不到真实数据就显示 `[--]`，不编数字。**
public struct Stats: Codable, Equatable {
    public var packetLoss: Double?
    public var jitterMs: Double?
    public var underruns: Int?
    public var latencyMs: Double?

    public init(
        packetLoss: Double? = nil,
        jitterMs: Double? = nil,
        underruns: Int? = nil,
        latencyMs: Double? = nil
    ) {
        self.packetLoss = packetLoss
        self.jitterMs = jitterMs
        self.underruns = underruns
        self.latencyMs = latencyMs
    }

    public static let empty = Stats(packetLoss: nil, jitterMs: nil, underruns: nil, latencyMs: nil)
}

/// 电脑端对外广播的状态
public struct ServerState: Codable, Equatable {
    /// 电脑端是否正在收音（手机据此提示「电脑端没有在收音」）
    public var recording: Bool
    public var foregroundApp: String
    public var foregroundBundleId: String
    public var outputDeviceId: String
    public var bufferMs: Int

    public init(
        recording: Bool,
        foregroundApp: String,
        foregroundBundleId: String,
        outputDeviceId: String,
        bufferMs: Int
    ) {
        self.recording = recording
        self.foregroundApp = foregroundApp
        self.foregroundBundleId = foregroundBundleId
        self.outputDeviceId = outputDeviceId
        self.bufferMs = bufferMs
    }
}

/// 手机麦克风的状态
public enum MicMode: String, Codable {
    case idle
    case continuous
    case ptt
}
