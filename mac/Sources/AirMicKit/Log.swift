import Foundation
import OSLog

/// AirMic 的统一日志。
///
/// 三个去处：
/// 1. 系统日志（Console.app 里能搜到）
/// 2. `~/Library/Logs/AirMic/airmic.log`（排查问题时直接复制这个文件）
/// 3. `AIRMIC_LOG=stdout` 时打到标准输出（开发用）
public enum Log {
    private static let toStdout = ProcessInfo.processInfo.environment["AIRMIC_LOG"] == "stdout"

    private static let logger = Logger(subsystem: "com.airmic.mac", category: "airmic")

    private static let lock = NSLock()
    private static var fileSinkSuppressed = false

    /// 避免「日志截断 → 写日志 → 又触发截断」的递归
    static func suppressFileSink(_ body: () -> Void) {
        lock.lock()
        fileSinkSuppressed = true
        lock.unlock()
        body()
        lock.lock()
        fileSinkSuppressed = false
        lock.unlock()
    }

    private static func writeFile(_ level: String, _ message: String) {
        lock.lock()
        let suppressed = fileSinkSuppressed
        lock.unlock()
        guard !suppressed else { return }
        Diag.write("[\(level)] \(message)")
    }

    public static func debug(_ message: String) {
        if toStdout { print("[airmic] \(message)") }
        logger.debug("\(message, privacy: .public)")
        writeFile("DEBUG", message)
    }

    public static func info(_ message: String) {
        if toStdout { print("[airmic] \(message)") }
        logger.info("\(message, privacy: .public)")
        writeFile("INFO", message)
    }

    public static func error(_ message: String) {
        if toStdout { FileHandle.standardError.write("[airmic][error] \(message)\n".data(using: .utf8)!) }
        logger.error("\(message, privacy: .public)")
        writeFile("ERROR", message)
    }
}
