import SwiftUI
import AppKit

/// AirMic 的视觉 token（对应 prototype 的 DESIGN.md §3）。
///
/// 面板跟随 macOS 观感：毛玻璃底、极少分隔线、靠留白和字重建立层级。
/// 颜色全部是**动态颜色**：浅色 / 深色各一套值，系统切外观时自动适配。
enum Theme {
    // 表面（用于需要实底的地方；面板本身用毛玻璃）
    static let surface0 = Color.dynamic(light: 0xF4F4F7, dark: 0x0B0B0D)
    static let surface1 = Color.dynamic(light: 0xFFFFFF, dark: 0x141417)
    static let surface2 = Color.dynamicFill(light: 0x000000, lightAlpha: 0.07,
                                            dark: 0xFFFFFF, darkAlpha: 0.08)
    static let surface3 = Color.dynamicFill(light: 0x000000, lightAlpha: 0.12,
                                            dark: 0xFFFFFF, darkAlpha: 0.13)
    static let borderSubtle = Color.dynamicFill(light: 0x000000, lightAlpha: 0.10,
                                                dark: 0xFFFFFF, darkAlpha: 0.09)
    static let borderStrong = Color.dynamicFill(light: 0x000000, lightAlpha: 0.20,
                                                dark: 0xFFFFFF, darkAlpha: 0.17)

    // 文字
    static let textPrimary = Color.dynamic(light: 0x16161A, dark: 0xF2F2F4)
    static let textSecondary = Color.dynamic(light: 0x55555F, dark: 0xA0A0AA)
    static let textTertiary = Color.dynamic(light: 0x83838D, dark: 0x6E6E78)
    static let textFaint = Color.dynamic(light: 0xAFAFB9, dark: 0x4A4A52)

    // 语义
    static let amber = Color.dynamic(light: 0xE89A00, dark: 0xFFB020)
    static let connected = Color.dynamic(light: 0x128F5C, dark: 0x35C98A)
    static let recording = Color.dynamic(light: 0xD9423B, dark: 0xFF5A5A)

    /// 毛玻璃上的薄着色层：保证文字对比度，同时保留透明感
    static let panelTint = Color.dynamicFill(
        light: 0xFFFFFF, lightAlpha: 0.38,
        dark: 0x0B0B0D, darkAlpha: 0.42
    )

    /// 分组卡片：比底色再亮一层 —— 像控制中心那样把功能区域分开
    static let card = Color.dynamicFill(
        light: 0xFFFFFF, lightAlpha: 0.62,
        dark: 0xFFFFFF, darkAlpha: 0.07
    )

    // 圆角
    static let radiusLarge: CGFloat = 12
    static let radiusSmall: CGFloat = 8
}

extension Color {
    /// 固定色（hex）
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    /// 浅色 / 深色两套值，跟随系统外观自动切换
    static func dynamic(light: UInt32, dark: UInt32, lightAlpha: Double = 1, darkAlpha: Double = 1) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return isDark
                ? NSColor.srgb(hex: dark, alpha: darkAlpha)
                : NSColor.srgb(hex: light, alpha: lightAlpha)
        })
    }

    /// 半透明填充（用在毛玻璃上，会跟背景混合）
    static func dynamicFill(light: UInt32, lightAlpha: Double, dark: UInt32, darkAlpha: Double) -> Color {
        dynamic(light: light, dark: dark, lightAlpha: lightAlpha, darkAlpha: darkAlpha)
    }
}

private extension NSColor {
    static func srgb(hex: UInt32, alpha: Double) -> NSColor {
        NSColor(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: CGFloat(alpha)
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
