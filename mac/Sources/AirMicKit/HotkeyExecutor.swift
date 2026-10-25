import AppKit
import ApplicationServices
import Carbon.HIToolbox
import Foundation

/// 在电脑上模拟按键。
///
/// ⚠️ CGEvent 需要**辅助功能权限**（Accessibility）。没有权限时 CGEvent 会被系统
/// 静默丢弃 —— 所以必须先检查，并且明确告诉用户去哪儿开。
public struct HotkeyExecutor {
    public init() {}

    /// 是否有辅助功能权限
    public static var hasAccessibilityPermission: Bool {
        AXIsProcessTrusted()
    }

    /// 触发一次系统权限弹窗（第一次用时调用）
    @discardableResult
    public static func requestAccessibilityPermission() -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    /// 执行一组组合键，如 ["cmd", "shift", "v"]
    ///
    /// - Parameter target: 要接收按键的前台应用。
    ///   ⚠️ 必须先激活它 —— 菜单栏面板打开时 AirMic 自己可能成为 active app，
    ///   那样按键就发给了 AirMic 自己（表现为「⌘Space 能用但 ⌘T 没反应」：
    ///   系统快捷键照样生效，普通快捷键却没人接）。
    /// - Returns: 是否成功（没权限 / 键不认识都会返回 false）
    @discardableResult
    public func execute(combo: [String], target: NSRunningApplication? = nil) -> Bool {
        guard !combo.isEmpty else { return false }
        guard Self.hasAccessibilityPermission else {
            Log.error("没有辅助功能权限，快捷键无法执行")
            return false
        }

        // 先把焦点交回前台应用
        if let target {
            target.activate(options: [.activateIgnoringOtherApps])
            // 给系统一点时间切过去（activate 是异步的）
            Thread.sleep(forTimeInterval: 0.05)
        }

        // 鼠标键与键盘主键互斥
        if let mouse = combo.last, mouse.hasPrefix("mouse") || mouse.hasPrefix("wheel") {
            return executeMouse(combo: combo)
        }
        return executeKeyboard(combo: combo)
    }

    // MARK: - 键盘

    private func executeKeyboard(combo: [String]) -> Bool {
        var flags: CGEventFlags = []
        var mainKey: String?

        for token in combo {
            switch token {
            case "cmd": flags.insert(.maskCommand)
            case "shift": flags.insert(.maskShift)
            case "ctrl": flags.insert(.maskControl)
            case "alt": flags.insert(.maskAlternate)
            default:
                if mainKey == nil { mainKey = token }
            }
        }
        guard let mainKey, let keyCode = Self.keyCode(for: mainKey) else {
            Log.error("不认识的按键：\(mainKey ?? "-")")
            return false
        }

        let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true)
        let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false)
        down?.flags = flags
        up?.flags = flags
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
        Log.info("执行快捷键：\(combo.joined(separator: "+"))")
        return true
    }

    // MARK: - 鼠标

    private func executeMouse(combo: [String]) -> Bool {
        var flags: CGEventFlags = []
        for token in combo where token != combo.last {
            switch token {
            case "cmd": flags.insert(.maskCommand)
            case "shift": flags.insert(.maskShift)
            case "ctrl": flags.insert(.maskControl)
            case "alt": flags.insert(.maskAlternate)
            default: break
            }
        }

        let mouseToken = combo.last ?? "mouse1"
        let source = CGEventSource(stateID: .hidSystemState)

        switch mouseToken {
        case "mouse1", "mouse2", "mouse3":
            let button: CGMouseButton = mouseToken == "mouse1" ? .left : (mouseToken == "mouse2" ? .right : .center)
            guard let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: .zero, mouseButton: button),
                  let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: .zero, mouseButton: button)
            else { return false }
            down.flags = flags
            up.flags = flags
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
        case "wheelup", "wheeldown":
            let delta: Int32 = mouseToken == "wheelup" ? 1 : -1
            guard let scroll = CGEvent(scrollWheelEvent2Source: source, units: .line, wheelCount: 1, wheel1: delta, wheel2: 0, wheel3: 0)
            else { return false }
            scroll.flags = flags
            scroll.post(tap: .cghidEventTap)
        default:
            return false
        }
        Log.info("执行鼠标键：\(combo.joined(separator: "+"))")
        return true
    }

    // MARK: - 键码表

    /// macOS 虚拟键码（Carbon HIToolbox 的 ANSI 布局）
    public static func keyCode(for key: String) -> CGKeyCode? {
        if let code = specialKeys[key] { return code }
        // 字母：a-z 的 ASCII 码就是 macOS 键码
        if key.count == 1, let ascii = key.uppercased().first?.asciiValue {
            return CGKeyCode(ascii)
        }
        return nil
    }

    private static let specialKeys: [String: CGKeyCode] = [
        "space": 49,
        "enter": 36,
        "return": 36,
        "tab": 48,
        "escape": 53,
        "backspace": 51,
        "delete": 117,
        "home": 115,
        "end": 119,
        "pageup": 116,
        "pagedown": 121,
        "arrowup": 126,
        "arrowdown": 125,
        "arrowleft": 123,
        "arrowright": 124,
        "up": 126,
        "down": 125,
        "left": 123,
        "right": 124,
    ]
}
