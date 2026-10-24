import Foundation
import OSLog

/// AirMic 的统一日志。
///
/// 面板里不能出现「刷屏的日志」，所以默认只进系统日志；
/// 需要排查时用 `AIRMIC_LOG=stdout` 让它同时打到标准输出。
public enum Log {
    private static let toStdout = ProcessInfo.processInfo.environment["AIRMIC_LOG"] == "stdout"

    private static let logger = Logger(subsystem: "com.airmic.mac", category: "airmic")

    public static func debug(_ message: String) {
        if toStdout { print("[airmic] \(message)") }
        logger.debug("\(message, privacy: .public)")
    }

    public static func info(_ message: String) {
        if toStdout { print("[airmic] \(message)") }
        logger.info("\(message, privacy: .public)")
    }

    public static func error(_ message: String) {
        if toStdout { FileHandle.standardError.write("[airmic][error] \(message)\n".data(using: .utf8)!) }
        logger.error("\(message, privacy: .public)")
    }
}
