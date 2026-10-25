import AirMicKit
import SwiftUI

/// 菜单栏面板。宽度固定 318px（需求说明书 §2.1）。
///
/// 纵向顺序不可变：状态行 → 配对码 → 输出设备 → 收音主按钮 → 详细设置 → 退出。
struct PanelView: View {
    @ObservedObject var state: AppState
    @State private var detailsExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            statusRow
            Divider().overlay(Theme.borderSubtle)

            if !state.pendingRequests.isEmpty {
                pairingRequestCard
            }

            if !state.hasAccessibilityPermission {
                accessibilityHint
            }

            VStack(alignment: .leading, spacing: 12) {
                pairCodeRow
                outputDeviceRow
                recordButton
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)

            Divider().overlay(Theme.borderSubtle)

            detailsSection
            pairedDevicesSection

            Divider().overlay(Theme.borderSubtle)

            Button("退出 AirMic") { state.quit() }
                .buttonStyle(.plain)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: 318)
        .background(Theme.surface1)
        .foregroundStyle(Theme.textPrimary)
        .onAppear {
            // 面板打开时刷新设备列表（设备可能被插拔）
            state.refreshDevices()
        }
        .onChange(of: state.pendingRequests.count) { count in
            // 面板确实收到了配对请求（排查「手机在等、电脑没反应」用）
            AirMicKit.Log.info("面板：待处理的配对请求 = \(count)")
        }
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
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
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
                .background(Theme.surface2)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusLarge))
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
    }

    // MARK: - 辅助功能权限

    /// 没有辅助功能权限，手机点磁贴不会有反应 —— 明确告诉用户去哪儿开
    private var accessibilityHint: some View {
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
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.surface2)
    }

    // MARK: - 配对码

    private var pairCodeRow: some View {
        HStack(spacing: 8) {
            Text("配对码")
                .font(.system(size: 11))
                .foregroundStyle(Theme.textSecondary)

            Spacer(minLength: 0)

            Text(pairCodeDigits)
                .font(.system(size: 15, weight: .medium, design: .monospaced))
                .tracking(2)
                .foregroundStyle(Theme.textPrimary)
                .monospacedDigit()

            Button {
                state.refreshPairCode()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 11, weight: .medium))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.textSecondary)
            .help("刷新配对码（旧码立刻失效）")
        }
    }

    /// 6 位数字，拆开显示，等宽
    private var pairCodeDigits: String {
        let code = state.pairCode
        guard code.count == 6 else { return code }
        return stride(from: 0, to: 6, by: 2).map { index -> String in
            let start = code.index(code.startIndex, offsetBy: index)
            let end = code.index(start, offsetBy: 2)
            return String(code[start..<end])
        }.joined(separator: " ")
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
                RoundedRectangle(cornerRadius: Theme.radiusLarge)
                    .fill(state.isRecording ? Theme.surface2 : Theme.amber)
            )
            .foregroundStyle(state.isRecording ? Theme.textPrimary : Color.black)
        }
        .buttonStyle(.plain)
    }

    // MARK: - 详细设置

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                detailsExpanded.toggle()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .rotationEffect(.degrees(detailsExpanded ? 90 : 0))
                    Text("详细设置")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(Theme.textSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if detailsExpanded {
                VStack(alignment: .leading, spacing: 10) {
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

                    Toggle(isOn: Binding(
                        get: { state.testToneOn },
                        set: {
                            state.testToneOn = $0
                            state.setTestTone($0)
                        }
                    )) {
                        Text("1kHz 测试音")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.textSecondary)
                    }
                    .toggleStyle(.switch)
                    .controlSize(.mini)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
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
            VStack(alignment: .leading, spacing: 6) {
                Text("已配对设备")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.textTertiary)
                    .padding(.horizontal, 12)

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
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                }
            }
            .padding(.bottom, 8)
        }
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
                RoundedRectangle(cornerRadius: Theme.radiusSmall)
                    .fill(isPrimary ? Theme.amber : Theme.surface3)
            )
            .foregroundStyle(isPrimary ? Color.black : Theme.textPrimary)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
