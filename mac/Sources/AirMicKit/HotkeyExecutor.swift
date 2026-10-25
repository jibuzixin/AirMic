import AppKit
import ApplicationServices
import Carbon.HIToolbox
import Foundation

/// 在电脑上模拟按键。
///
/// ⚠️ CGEvent 需要**辅助功能权限**（Accessibility）。没有权限时 CGEvent 会被系统
/// 静默丢弃 —— 所以必须先检查，并且明确告诉用户去哪儿开。
public final class HotkeyExecutor {
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

    /// 长按语义：按下的组合键（等 release 时才松开）
    ///
    /// 除了主键，**还必须真的按下 / 松开修饰键**：
    /// 只给主键挂 flags，很多 App 收不到 flagsChanged，会觉得 ⌘⇧ 一直按着不放。
    private var held: (keyCode: CGKeyCode, flags: CGEventFlags, modifiers: [String])?

    /// 按住时的重复触发（模拟系统按键重复）
    private var repeatDelayTimer: Timer?
    private var repeatTimer: Timer?

    /// 修饰键的虚拟键码（左侧）
    private static let modifierKeyCodes: [String: CGKeyCode] = [
        "ctrl": 59, "alt": 58, "shift": 56, "cmd": 55,
    ]

    /// 修饰键按下/抬起的固定顺序
    private static let modifierOrder = ["ctrl", "alt", "shift", "cmd"]

    /// 按下组合键但不松开（长按说话用）
    @discardableResult
    public func press(combo: [String], target: NSRunningApplication? = nil) -> Bool {
        guard !combo.isEmpty else { return false }
        guard Self.hasAccessibilityPermission else {
            Log.error("没有辅助功能权限，快捷键无法执行")
            return false
        }
        activate(target)
        guard let resolved = Self.resolve(combo) else {
            Log.error("不认识的组合键：\(combo.joined(separator: "+"))")
            return false
        }

        let modifiers = Self.modifierOrder.filter { resolved.modifiers.contains($0) }
        var flags: CGEventFlags = []
        // 先逐个按下修饰键（每按一个，flags 累加）
        for token in modifiers {
            switch token {
            case "cmd": flags.insert(.maskCommand)
            case "shift": flags.insert(.maskShift)
            case "ctrl": flags.insert(.maskControl)
            case "alt": flags.insert(.maskAlternate)
            default: continue
            }
            guard let code = Self.modifierKeyCodes[token] else { continue }
            let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)
            event?.flags = flags
            event?.post(tap: .cghidEventTap)
        }
        // 再按主键
        let down = CGEvent(keyboardEventSource: nil, virtualKey: resolved.keyCode, keyDown: true)
        down?.flags = resolved.flags
        down?.post(tap: .cghidEventTap)

        held = (resolved.keyCode, resolved.flags, modifiers)
        startRepeating(keyCode: resolved.keyCode, flags: resolved.flags)
        Log.info("按下组合键：\(combo.joined(separator: "+"))")
        return true
    }

    /// 松开之前按下的组合键
    @discardableResult
    public func release() -> Bool {
        stopRepeating()
        guard let held else { return false }

        // 先松开主键
        let up = CGEvent(keyboardEventSource: nil, virtualKey: held.keyCode, keyDown: false)
        up?.flags = held.flags
        up?.post(tap: .cghidEventTap)

        // 再按相反顺序松开修饰键
        var flags = held.flags
        for token in held.modifiers.reversed() {
            switch token {
            case "cmd": flags.remove(.maskCommand)
            case "shift": flags.remove(.maskShift)
            case "ctrl": flags.remove(.maskControl)
            case "alt": flags.remove(.maskAlternate)
            default: continue
            }
            guard let code = Self.modifierKeyCodes[token] else { continue }
            let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
            event?.flags = flags
            event?.post(tap: .cghidEventTap)
        }

        self.held = nil
        Log.info("松开组合键")
        return true
    }

    /// 按住不放时按系统节奏重复发送（撤销、删除这类操作需要连发）
    private func startRepeating(keyCode: CGKeyCode, flags: CGEventFlags) {
        stopRepeating()
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            // 第一次重复前等 0.35s（和系统 initial delay 接近）
            let delay = Timer(timeInterval: 0.35, repeats: false) { [weak self] _ in
                guard let self, self.held != nil else { return }
                let timer = Timer(timeInterval: 0.06, repeats: true) { [weak self] _ in
                    guard let self, self.held != nil else {
                        self?.stopRepeating()
                        return
                    }
                    let event = CGEvent(
                        keyboardEventSource: nil,
                        virtualKey: keyCode,
                        keyDown: true
                    )
                    event?.flags = flags
                    event?.setIntegerValueField(.keyboardEventAutorepeat, value: 1)
                    event?.post(tap: .cghidEventTap)
                }
                RunLoop.main.add(timer, forMode: .common)
                self.repeatTimer = timer
            }
            RunLoop.main.add(delay, forMode: .common)
            self.repeatDelayTimer = delay
        }
    }

    private func stopRepeating() {
        repeatDelayTimer?.invalidate()
        repeatDelayTimer = nil
        repeatTimer?.invalidate()
        repeatTimer = nil
    }

    /// 把焦点交回前台应用，并等它真的切过去
    private func activate(_ target: NSRunningApplication?) {
        guard let target else { return }
        if Thread.isMainThread {
            target.activate(options: [.activateIgnoringOtherApps])
        } else {
            DispatchQueue.main.async {
                target.activate(options: [.activateIgnoringOtherApps])
            }
        }
        let deadline = Date().addingTimeInterval(0.4)
        while !target.isActive && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.02)
        }
        Thread.sleep(forTimeInterval: 0.03)
    }

    /// 组合键 → 键码 + 修饰键标志
    static func resolve(
        _ combo: [String]
    ) -> (keyCode: CGKeyCode, flags: CGEventFlags, modifiers: [String])? {
        var flags: CGEventFlags = []
        var modifiers: [String] = []
        var mainKey: String?
        for token in combo {
            switch token {
            case "cmd":
                flags.insert(.maskCommand); modifiers.append("cmd")
            case "shift":
                flags.insert(.maskShift); modifiers.append("shift")
            case "ctrl":
                flags.insert(.maskControl); modifiers.append("ctrl")
            case "alt":
                flags.insert(.maskAlternate); modifiers.append("alt")
            default:
                if mainKey == nil { mainKey = token }
            }
        }
        guard let mainKey, let keyCode = keyCode(for: mainKey) else { return nil }
        return (keyCode, flags, modifiers)
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
        //
        // ⚠️ activate 要回主线程调用，且它本身是异步的 —— 等它真的切过去再发按键，
        // 否则按键还是会落到 AirMic 自己身上。
        activate(target)

        // 鼠标键与键盘主键互斥
        if let mouse = combo.last, mouse.hasPrefix("mouse") || mouse.hasPrefix("wheel") {
            return executeMouse(combo: combo)
        }
        Log.info("执行快捷键：\(combo.joined(separator: "+")) → \(target?.localizedName ?? "当前焦点应用")")
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
        Log.debug("按键 \(mainKey) → keyCode \(keyCode)")

        let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true)
        let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false)
        down?.flags = flags
        up?.flags = flags
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
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

    /// macOS 虚拟键码
    ///
    /// ⚠️ **字母/数字不是 ASCII**：`kVK_ANSI_V` = 9，而 'V' 的 ASCII 是 86。
    /// 之前按 ASCII 算过，结果 ⌘Space（空格有单独映射）能用，⌘T / ⌘V / ⌘C 全废。
    public static func keyCode(for key: String) -> CGKeyCode? {
        let normalized = key.lowercased()
        if let code = ansiKeys[normalized] { return code }
        if let code = functionKeys[normalized] { return code }
        if let code = specialKeys[normalized] { return code }
        return nil
    }

    /// 字母、数字、符号（ANSI 布局）
    private static let ansiKeys: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
        "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24,
        "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30,
        "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "l": 37, "j": 38, "'": 39,
        "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47, "`": 50,
    ]

    /// 功能键
    private static let functionKeys: [String: CGKeyCode] = [
        "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97,
        "f7": 98, "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
    ]

    /// 编辑键 / 方向键
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
