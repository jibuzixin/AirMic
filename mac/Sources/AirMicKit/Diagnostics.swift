import Foundation

/// 诊断日志
/// ------------------------------------------------------------
/// 用户排查「没有声音」这类问题时，最需要的是**现场数据**：
/// 包有没有到、解码出多少、写进设备多少帧。
///
/// 这些统一写进 `~/Library/Logs/AirMic/airmic.log`，面板里可以一键复制。
/// 不依赖终端、不依赖环境变量，正式版也一直开着（体积很小，自动截断）。
public enum Diag {

    /// 日志文件位置
    public static var logURL: URL {
        let library = FileManager.default
            .urls(for: .libraryDirectory, in: .userDomainMask)[0]
        return library
            .appendingPathComponent("Logs", isDirectory: true)
            .appendingPathComponent("AirMic", isDirectory: true)
            .appendingPathComponent("airmic.log")
    }

    public static var logDirectory: URL {
        logURL.deletingLastPathComponent()
    }

    /// 超过这个大小就截掉前半段
    private static let maxBytes = 1_500_000

    private static let queue = DispatchQueue(label: "com.airmic.diag", qos: .utility)
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM-dd HH:mm:ss.SSS"
        return formatter
    }()

    private static var prepared = false

    /// 写一行（线程安全，异步落盘）
    public static func write(_ message: String) {
        let line = "\(formatter.string(from: Date())) \(message)\n"
        queue.async {
            prepareIfNeeded()
            guard let data = line.data(using: .utf8) else { return }
            if let handle = try? FileHandle(forWritingTo: logURL) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            } else {
                try? data.write(to: logURL, options: .atomic)
            }
            trimIfNeeded()
        }
    }

    private static func prepareIfNeeded() {
        guard !prepared else { return }
        prepared = true
        try? FileManager.default.createDirectory(
            at: logDirectory,
            withIntermediateDirectories: true
        )
        // 每次启动写一条分隔线，方便看清是哪一次运行
        let header = "\n===== AirMic 启动 \(formatter.string(from: Date())) =====\n"
        if let data = header.data(using: .utf8) {
            if let handle = try? FileHandle(forWritingTo: logURL) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            } else {
                try? data.write(to: logURL, options: .atomic)
            }
        }
    }

    /// 太大就只保留后半段
    private static func trimIfNeeded() {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: logURL.path),
              let size = attributes[.size] as? Int,
              size > maxBytes,
              let data = try? Data(contentsOf: logURL)
        else { return }
        let keep = data.suffix(maxBytes / 2)
        try? keep.write(to: logURL, options: .atomic)
        Log.suppressFileSink {
            Log.info("日志超过上限，已截断")
        }
    }

    /// 读最近若干行
    public static func tail(_ lines: Int = 500) -> String {
        guard let data = try? Data(contentsOf: logURL),
              let text = String(data: data, encoding: .utf8)
        else { return "（还没有日志）" }
        let all = text.split(separator: "\n", omittingEmptySubsequences: false)
        return all.suffix(lines).joined(separator: "\n")
    }

    /// 生成一份可以直接粘贴给我看的报告
    public static func report() -> String {
        let version = Bundle.main
            .object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        let os = ProcessInfo.processInfo.operatingSystemVersionString
        let env = ProcessInfo.processInfo.environment["AIRMIC_PORT"] ?? "默认"
        return """
        ===== AirMic 诊断报告 =====
        版本: \(version)   系统: \(os)
        端口: \(env)
        日志文件: \(logURL.path)
        ===========================

        \(tail(600))
        """
    }

    /// 清空日志
    public static func clear() {
        queue.async {
            try? "".write(to: logURL, atomically: true, encoding: .utf8)
            prepared = false
        }
    }
}
