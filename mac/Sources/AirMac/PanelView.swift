import AirMicKit
import SwiftUI

/// 菜单栏面板。宽度固定 318px（需求说明书 §2.1）。
///
/// 纵向顺序：状态行 → 音频输出/收音 → 详细设置 → 已配对设备 → 退出。
///
/// 背景是外层 NSPanel 的毛玻璃；这里再盖一层半透明底色，
/// 并把每组功能放进「卡片」（照控制中心的做法）——
/// 既保证文字可读，也把不同的功能区域分开。
struct PanelView: View {
    @ObservedObject var state: AppState
    /// 内容高度变化时回调 —— 外层 NSPanel 用它调整窗口高度
    var onHeightChange: ((CGFloat) -> Void)?

    /// 面板右下角显示的版本号（用来确认跑的是哪一份构建）
    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            statusRow

            if !state.pendingRequests.isEmpty {
                pairingRequestCard
            }

            if !state.hasAccessibilityPermission {
                accessibilityHint
            }

            SectionCard {
                VStack(alignment: .leading, spacing: 10) {
                    outputDeviceRow
                    recordButton
                }
            }

            SectionCard {
                detailsSection
            }

            pairedDevicesSection

            footer
        }
        .padding(10)
        .frame(width: 318)
        // 半透明底色：毛玻璃仍然透，但文字有了对比度。
        // 必须自己也是圆角 —— 否则矩形底色会把毛玻璃的圆角盖成直角。
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.panelTint)
        )
        .background(
            GeometryReader { proxy in
                Color.clear.preference(key: PanelHeightKey.self, value: proxy.size.height)
            }
        )
        .onPreferenceChange(PanelHeightKey.self) { height in
            onHeightChange?(height)
        }
        .foregroundStyle(Theme.textPrimary)
        .onAppear {
            // 面板打开时刷新设备列表（设备可能被插拔）
            state.refreshDevices()
        }
        .onChange(of: state.pendingRequests.count) { count in
            AirMicKit.Log.info("面板：待处理的配对请求 = \(count)")
        }
    }

    // MARK: - 底部

    private var footer: some View {
        HStack(spacing: 8) {
            Button("退出 AirMic") { state.quit() }
                .buttonStyle(.plain)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)

            Spacer(minLength: 0)

            Text("v\(appVersion)")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(Theme.textFaint)
        }
        .padding(.horizontal, 4)
        .padding(.top, 2)
    }

    // MARK: - 状态行

    private var statusRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle()
                    .fill(state.connectedPhoneName == nil ? Theme.textTertiary : Theme.connected)
                    .frame(width: 7, height: 7)
                Text(state.connectedPhoneName.map { "\($0)" } ?? "未连接")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
            }
            Text("当前应用：\(state.foregroundAppName)")
                .font(.system(size: 11))
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(.horizontal, 4)
        .padding(.top, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 配对请求

    private var pairingRequestCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(state.pendingRequests) { request in
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(request.displayName) 请求配对")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                    HStack(spacing: 8) {
                        Button("允许") { state.respond(to: request, approved: true) }
                            .buttonStyle(PanelActionButtonStyle(isPrimary: true))
                        Button("拒绝") { state.respond(to: request, approved: false) }
                            .buttonStyle(PanelActionButtonStyle(isPrimary: false))
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    // MARK: - 辅助功能权限

    /// 没有辅助功能权限，手机点磁贴不会有反应 —— 明确告诉用户去哪儿开
    private var accessibilityHint: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.amber)
                Text("快捷键需要「辅助功能」权限")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textSecondary)
                Spacer(minLength: 0)
                Button("去授权") {
                    state.requestAccessibilityPermission()
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.amber)
            }

            if state.accessibilityHintShown {
                HStack(spacing: 6) {
                    Text("如果已经打开还是不行：把 AirMic 从列表里删掉再加回来（重新打包会换签名，旧授权会失效）")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button("重新检测") { state.recheckAccessibility() }
                        .buttonStyle(.plain)
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: - 输出设备

    private var outputDeviceRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text("音频输出")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textSecondary)
                Spacer(minLength: 0)
                Picker("", selection: Binding(
                    get: { state.outputDeviceId },
                    set: { state.selectOutputDevice($0) }
                )) {
                    ForEach(state.devices) { device in
                        Text(device.name).tag(device.id)
                    }
                }
                .labelsHidden()
                .controlSize(.small)
                .frame(maxWidth: 168)
            }

            // 用户最常踩的坑：选了扬声器，声音不会变成「电脑麦克风」
            if let hint = outputHint {
                Text(hint)
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// 输出的提示文案
    private var outputHint: String? {
        let hasVirtual = state.devices.contains { $0.isVirtual }
        guard hasVirtual else {
            return "没找到虚拟设备 —— 装 BlackHole 才能把手机麦克风变成电脑麦克风"
        }
        let selected = state.devices.first { $0.id == state.outputDeviceId }
        guard let selected, !selected.isVirtual else { return nil }
        return "当前选的是扬声器。要当麦克风用，请选 BlackHole 之类的虚拟设备"
    }

    // MARK: - 收音主按钮

    private var recordButton: some View {
        Button {
            state.toggleRecording()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: state.isRecording ? "stop.fill" : "mic.fill")
                    .font(.system(size: 11, weight: .semibold))
                Text(state.isRecording ? "停止收音" : "开始收音")
                    .font(.system(size: 12, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: Theme.radiusLarge, style: .continuous)
                    .fill(state.isRecording ? Theme.surface2 : Theme.amber)
            )
            .foregroundStyle(state.isRecording ? Theme.textPrimary : Color.black)
        }
        .buttonStyle(.plain)
    }

    // MARK: - 详细设置

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("详细设置")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.textTertiary)

            statsGrid

            HStack(spacing: 8) {
                Text("抖动缓冲")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textSecondary)
                Slider(
                    value: Binding(
                        get: { Double(state.bufferMs) },
                        set: { state.setBuffer(Int($0)) }
                    ),
                    in: 20...300,
                    step: 10
                )
                .controlSize(.small)
                Text("\(state.bufferMs)ms")
                    .tabularNumbers()
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textSecondary)
                    .frame(width: 42, alignment: .trailing)
            }

            // 静默多久自动停止收音（0 = 不自动关）—— 省电
            HStack(spacing: 8) {
                Text("静默自动关闭")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textSecondary)
                Spacer(minLength: 0)
                Text(state.silenceSeconds == 0 ? "关闭" : "\(state.silenceSeconds)s")
                    .tabularNumbers()
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textSecondary)
                Stepper(
                    "",
                    value: Binding(
                        get: { state.silenceSeconds },
                        set: { state.setSilence($0) }
                    ),
                    in: 0...120,
                    step: 5
                )
                .labelsHidden()
                .controlSize(.small)
            }

            // 排查用：把现场数据一键交付
            HStack(spacing: 8) {
                Button(state.diagnosticsCopied ? "已复制" : "复制诊断日志") {
                    state.copyDiagnostics()
                }
                .buttonStyle(PanelActionButtonStyle(isPrimary: false))

                Button("打开日志文件夹") {
                    state.openLogFolder()
                }
                .buttonStyle(PanelActionButtonStyle(isPrimary: false))

                Button("清空") {
                    state.clearDiagnostics()
                }
                .buttonStyle(PanelActionButtonStyle(isPrimary: false))

                Spacer(minLength: 0)
            }
        }
    }

    /// 四个统计指标。拿不到真实数据就显示 `[--]` —— **不编数字**。
    private var statsGrid: some View {
        let items: [(String, String)] = [
            ("丢包", formatPercent(state.stats.packetLoss)),
            ("抖动", formatMs(state.stats.jitterMs)),
            ("欠载", state.stats.underruns.map(String.init) ?? "--"),
            ("延迟", formatMs(state.stats.latencyMs)),
        ]
        return HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.0)
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textTertiary)
                    Text(item.1)
                        .tabularNumbers()
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if index < items.count - 1 {
                    Divider().overlay(Theme.borderSubtle).frame(height: 26)
                }
            }
        }
    }

    private func formatPercent(_ value: Double?) -> String {
        guard let value else { return "[--]" }
        return String(format: "%.1f%%", value)
    }

    private func formatMs(_ value: Double?) -> String {
        guard let value else { return "[--]" }
        return String(format: "%.0fms", value)
    }

    // MARK: - 已配对设备

    @ViewBuilder
    private var pairedDevicesSection: some View {
        if !state.pairedDevices.isEmpty {
            SectionCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("已配对设备")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textTertiary)

                    ForEach(state.pairedDevices) { device in
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(device.displayName)
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.textPrimary)
                                Text(device.model)
                                    .font(.system(size: 10))
                                    .foregroundStyle(Theme.textTertiary)
                            }
                            Spacer(minLength: 0)
                            Button {
                                state.unpair(device)
                            } label: {
                                Image(systemName: "trash")
                                    .font(.system(size: 11))
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(Theme.textTertiary)
                            .help("删除配对信息（这台手机下次要重新配对）")
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }
}

/// 分组卡片（照控制中心的做法：一组功能一张卡）
struct SectionCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// 面板里的次级按钮
struct PanelActionButtonStyle: ButtonStyle {
    let isPrimary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: .medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                    .fill(isPrimary ? Theme.amber : Theme.surface3)
            )
            .foregroundStyle(isPrimary ? Color.black : Theme.textPrimary)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// 内容高度（给外层窗口调整用）
struct PanelHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
