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
    ///
    /// - Parameter maxBytes: 总数据量上限。超过就返回 nil（例如用户复制了一段
    ///   几百 MB 的视频，没必要为了还原把它整个读进内存）。
    public static func capture(
        _ pasteboard: NSPasteboard,
        maxBytes: Int = .max
    ) -> ClipboardSnapshot? {
        var total = 0
        var items: [Item] = []
        for item in pasteboard.pasteboardItems ?? [] {
            var data: [String: Data] = [:]
            var types: [String] = []
            for type in item.types {
                guard let value = item.data(forType: type) else { continue }
                total += value.count
                if total > maxBytes { return nil }
                types.append(type.rawValue)
                data[type.rawValue] = value
            }
            if !types.isEmpty {
                items.append(Item(types: types, data: data))
            }
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
///
/// ## 连续粘贴
///
/// 磁片组里可能连着好几步文本。每次粘贴都各自抓快照的话，第二次抓到的
/// 会是第一段文字，最后还原出来的是「第一段」而不是用户原来的内容。
/// 所以这里只保留**第一次粘贴前**的快照，并且只有最后一次粘贴的计时器
/// 负责还原。
public final class TextPaster {
    /// 粘贴完之后等多久再把原剪贴板还回去
    ///
    /// 得给目标应用留出读取剪贴板的时间：绝大多数应用在处理 ⌘V 的
    /// 事件处理函数里**同步**读取剪贴板，1.2 秒足够。
    public static let restoreDelay: TimeInterval = 1.2

    /// 快照数据量上限（32 MB）。超过就不还原，避免为了还原把很大的剪贴板读进内存。
    private static let maxSnapshotBytes = 32 * 1024 * 1024

    private let pasteboard: NSPasteboard
    /// 真正「按 ⌘V」的实现（测试时可以替换掉）
    private let sendPaste: (NSRunningApplication?) -> Bool

    /// 第一次粘贴前用户剪贴板的快照；连续粘贴期间一直保留
    private var originalClipboard: ClipboardSnapshot?
    /// 快照太大、没有抓（这种情况下不还原，保留粘贴后的文本）
    private var skippedOversizedClipboard = false
    /// 粘贴批次编号 —— 只有最新一批的计时器能还原
    private var generation = 0
    /// 最近一次写进剪贴板的文字
    private var pendingText: String?

    /// 正式使用：粘贴到系统剪贴板，并用 CGEvent 按 ⌘V
    public convenience init(hotkeyExecutor: HotkeyExecutor) {
        self.init(pasteboard: .general) { target in
            guard HotkeyExecutor.hasAccessibilityPermission else {
                Log.error("没有辅助功能权限，文本无法粘贴")
                return false
            }
            return hotkeyExecutor.execute(combo: ["cmd", "v"], target: target)
        }
    }

    /// 指定粘贴板和「粘贴动作」（自检 / 测试用）
    public init(
        pasteboard: NSPasteboard,
        sendPaste: @escaping (NSRunningApplication?) -> Bool
    ) {
        self.pasteboard = pasteboard
        self.sendPaste = sendPaste
    }

    /// 把文字粘贴到目标应用
    ///
    /// 必须在主线程调用（NSPasteboard 是 AppKit 对象）。
    /// - Parameter target: 接收文字的前台应用（先激活它再粘贴）。
    /// - Returns: 是否成功（空文本 / ⌘V 没发出去会返回 false）
    @discardableResult
    public func paste(_ text: String, target: NSRunningApplication? = nil) -> Bool {
        assert(Thread.isMainThread, "TextPaster 必须在主线程调用")
        guard !text.isEmpty else { return false }

        // 连续粘贴只保留最早的那份快照
        if originalClipboard == nil && !skippedOversizedClipboard {
            originalClipboard = ClipboardSnapshot.capture(
                pasteboard,
                maxBytes: Self.maxSnapshotBytes
            )
            if originalClipboard == nil {
                skippedOversizedClipboard = true
                Log.error("剪贴板内容超过 32MB，粘贴后不会还原")
            }
        }

        generation += 1
        let currentGeneration = generation

        // 剪贴板必须**先**写好，⌘V 才能读到正确内容
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        pendingText = text

        guard sendPaste(target) else {
            // 粘贴没发出去，别把用户的剪贴板也弄丢了（除非后面还有更新的粘贴）
            if generation == currentGeneration {
                restoreOriginal()
            }
            Log.error("粘贴失败：⌘V 没能发出去")
            return false
        }

        // 不记录正文内容，避免敏感文本进日志
        Log.info("粘贴文本（\(text.count) 字）")

        DispatchQueue.main.asyncAfter(deadline: .now() + Self.restoreDelay) { [weak self] in
            self?.restoreIfCurrent(generation: currentGeneration, text: text)
        }
        return true
    }

    /// 只有「最后一次粘贴」并且剪贴板仍是这段文字时才还原
    private func restoreIfCurrent(generation expected: Int, text: String) {
        guard generation == expected, pendingText == text else { return }
        // 用户中途自己复制了别的东西 —— 不能覆盖
        guard pasteboard.string(forType: .string) == text else {
            pendingText = nil
            originalClipboard = nil
            skippedOversizedClipboard = false
            return
        }
        restoreOriginal()
    }

    private func restoreOriginal() {
        let snapshot = originalClipboard
        let skipped = skippedOversizedClipboard
        originalClipboard = nil
        skippedOversizedClipboard = false
        pendingText = nil
        if let snapshot {
            snapshot.restore(into: pasteboard)
        } else if skipped {
            Log.info("剪贴板过大，保留粘贴后的文本")
        }
    }
}
