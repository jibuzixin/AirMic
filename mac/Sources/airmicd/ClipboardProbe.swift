import AirMicKit
import AppKit
import Foundation

/// 自检 `TextPaster` 的剪贴板快照 / 还原。
///
/// 用一块**私有粘贴板**，不碰用户真正的剪贴板，也不需要辅助功能权限 ——
/// 「按 ⌘V」换成只计数的假实现，所以不会往任何应用里粘贴东西。
///
/// 重点验证：连续粘贴两段文字后，还原的是**最早**的内容，不是第一段文字。
func runClipboardPasterTest() -> Bool {
    let pasteboard = NSPasteboard(name: .init("com.airmic.clipboard-test"))
    pasteboard.clearContents()

    let originalText = "原来的剪贴板 \(UUID().uuidString)"
    let originalRTF = Data("{\\rtf1 airmic-test}".utf8)
    let item = NSPasteboardItem()
    item.setString(originalText, forType: .string)
    item.setData(originalRTF, forType: .init("com.airmic.test.rtf"))
    guard pasteboard.writeObjects([item]) else {
        print("✗ 无法写入测试剪贴板")
        return false
    }

    var pasteCount = 0
    let paster = TextPaster(pasteboard: pasteboard) { _ in
        pasteCount += 1
        return true
    }

    guard paster.paste("第一段"), paster.paste("第二段") else {
        print("✗ paste 返回失败")
        return false
    }

    let pastedText = pasteboard.string(forType: .string)
    print("粘贴后剪贴板：\(pastedText ?? "nil")（期望「第二段」）")

    // 等还原计时器跑完
    RunLoop.main.run(until: Date().addingTimeInterval(TextPaster.restoreDelay + 0.4))

    let restoredText = pasteboard.string(forType: .string)
    let restoredRTF = pasteboard.data(forType: .init("com.airmic.test.rtf"))
    var ok = true

    if pasteCount != 2 {
        print("✗ 粘贴动作调用 \(pasteCount) 次，期望 2")
        ok = false
    }
    if pastedText != "第二段" {
        print("✗ 第二次粘贴没有写进剪贴板")
        ok = false
    }
    if restoredText != originalText {
        print("✗ 文本没有还原：\(restoredText ?? "nil")")
        ok = false
    }
    if restoredRTF != originalRTF {
        print("✗ 多类型数据没有还原")
        ok = false
    }

    print(ok ? "✓ 剪贴板快照/还原正常（连续粘贴后还原的是最早的内容）" : "✗ 剪贴板自检失败")
    pasteboard.releaseGlobally()
    return ok
}
