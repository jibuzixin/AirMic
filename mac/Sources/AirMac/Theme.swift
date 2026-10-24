import SwiftUI

/// AirMic 的视觉 token（对应 prototype 的 DESIGN.md §3）。
///
/// 桌面端面板跟随 macOS 观感：深色底、极少分隔线、靠留白和字重建立层级。
enum Theme {
    // 表面
    static let surface0 = Color(hex: 0x0B0B0D)
    static let surface1 = Color(hex: 0x141417)
    static let surface2 = Color(hex: 0x1C1C20)
    static let surface3 = Color(hex: 0x26262B)
    static let borderSubtle = Color(hex: 0x2A2A30)
    static let borderStrong = Color(hex: 0x3A3A42)

    // 文字
    static let textPrimary = Color(hex: 0xF2F2F4)
    static let textSecondary = Color(hex: 0xA0A0AA)
    static let textTertiary = Color(hex: 0x6E6E78)
    static let textFaint = Color(hex: 0x4A4A52)

    // 语义
    static let amber = Color(hex: 0xFFB020)
    static let connected = Color(hex: 0x35C98A)
    static let recording = Color(hex: 0xFF5A5A)

    // 圆角
    static let radiusLarge: CGFloat = 12
    static let radiusSmall: CGFloat = 8
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

/// 等宽数字（配对码、延迟、丢包率……数值不能跳）
extension View {
    func tabularNumbers() -> some View {
        self.font(.system(size: 12, weight: .regular, design: .monospaced))
            .monospacedDigit()
    }
}
