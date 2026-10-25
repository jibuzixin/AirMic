import AppKit
import ApplicationServices
import Foundation

/// 剪贴板快照 —— 用来在粘贴之后把用户**原来的**剪贴板还回去。
///
/// 只记数据，不记 `NSPasteboardItem` 本身：
/// 那些 item 是粘贴板服务端的懒视图，`clearContents()` 之后再取就拿不到了。
public struct ClipboardSnapshot {
    /// 剪贴板里的一项（对应用户复制的一「组」内容）
    public struct Item {
        /// 这一项包含的类型（UTI）
        public let types: [String]
        /// 每个类型对应的原始数据
        public let data: [String: Data]
    }

    /// 剪贴板里的所有项（多数时候只有一项）
    public let items: [Item]

    public init(items: [Item]) {
        self.items = items
    }

    /// 抓取当前剪贴板
    public static func capture(_ pasteboard: NSPasteboard) -> ClipboardSnapshot {
        let items = (pasteboard.pasteboardItems ?? []).map { item -> Item in
            var data: [String: Data] = [:]
            var types: [String] = []
            for type in item.types {
                types.append(type.rawValue)
                if let value = item.data(forType: type) {
                    data[type.rawValue] = value
                }
            }
            return Item(types: types, data: data)
        }
        return ClipboardSnapshot(items: items)
    }

    /// 把剪贴板恢复成快照时的样子
    ///
    /// ⚠️ `writeObjects` 会**清空**剪贴板，所以所有项必须一次性写进去，
    /// 分多次调用只会留下最后一项。
    public func restore(into pasteboard: NSPasteboard) {
        let restored = items.map { item -> NSPasteboardItem in
            let newItem = NSPasteboardItem()
            for (type, value) in item.data {
                newItem.setData(value, forType: NSPasteboard.PasteboardType(type))
            }
            return newItem
        }
        pasteboard.clearContents()
        guard !restored.isEmpty else { return }
        pasteboard.writeObjects(restored)
    }
}

/// 把一段提前编辑好的文字「粘贴」到电脑上的前台应用。
///
/// ## 为什么走剪贴板 + ⌘V，而不是直接注入字符
///
/// 直接用 `CGEvent.keyboardSetUnicodeString` 注入 Unicode 的办法**只对标准
/// AppKit 输入框有效**。自己处理键盘事件的应用（Flutter、Electron、
/// 很多远程桌面客户端和游戏）会**直接丢掉** unicodeString —— 表现就是
/// 「什么都没发生」，而电脑端日志显示一切正常，极难排查。
///
/// 剪贴板 + ⌘V 是所有应用都认的标准路径，和用户自己按 ⌘V 完全一样。
/// 附带好处：多行文本原生支持，不用再单独处理换行。
///
/// 代价是短暂占用剪贴板 —— 所以粘贴完会把用户原来的剪贴板还回去。
public final class TextPaster {
    /// 粘贴完之后等多久再把原剪贴板还回去
    ///
    /// 得给目标应用留出读取剪贴板的时间：绝大多数应用在处理 ⌘V 的
    /// 事件处理函数里**同步**读取剪贴板，1 秒足够。
    /// 要是还得太早，用户会看到「粘贴出来的是旧内容」——比多占用一秒剪贴板糟糕得多。
    private static let restoreDelay: TimeInterval = 1.0

    private let hotkeyExecutor: HotkeyExecutor

    public init(hotkeyExecutor: HotkeyExecutor) {
        self.hotkeyExecutor = hotkeyExecutor
    }

    /// 把文字粘贴到目标应用
    ///
    /// - Parameter target: 接收文字的前台应用（先激活它再粘贴）。
    /// - Returns: 是否成功（没权限 / 空文本都会返回 false）
    @discardableResult
    public func paste(_ text: String, target: NSRunningApplication? = nil) -> Bool {
        guard !text.isEmpty else { return false }
        guard HotkeyExecutor.hasAccessibilityPermission else {
            Log.error("没有辅助功能权限，文本无法粘贴")
            return false
        }

        let pasteboard = NSPasteboard.general
        // 先记下用户原来的剪贴板，粘完还回去
        let snapshot = ClipboardSnapshot.capture(pasteboard)

        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        // 粘贴 = 激活目标应用 + 按 ⌘V
        //
        // ⚠️ 顺序：剪贴板必须**先**写好，⌘V 才能读到正确内容。
        // 目标应用的激活发生在 execute() 内部，紧挨着 ⌘V，所以剪贴板在这之前就位。
        guard hotkeyExecutor.execute(combo: ["cmd", "v"], target: target) else {
            // 粘贴没发出去，别把用户的剪贴板也弄丢了
            snapshot.restore(into: pasteboard)
            Log.error("粘贴失败：⌘V 没能发出去")
            return false
        }

        Log.info("粘贴文本：\(text.prefix(30))")

        // 过一会儿把原剪贴板还回去
        //
        // ⚠️ 只在剪贴板**还是我们刚写的内容**时才还 ——
        // 用户要是中途自己复制了别的东西，不能被我们覆盖掉。
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.restoreDelay) {
            if pasteboard.string(forType: .string) == text {
                snapshot.restore(into: pasteboard)
            }
        }
        return true
    }
}
