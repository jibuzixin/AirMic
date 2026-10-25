import AirMicKit
import Foundation
import Network

/// airmicd —— 无界面的 AirMic 服务端。
///
/// 用途：
///   1. 开发期当「假手机端」以外的另一端，跑链路、跑协议、抓日志
///   2. 排查问题时单独起服务，看清楚是 UI 的问题还是内核的问题
///
/// 正式的菜单栏应用（AirMac）复用同一套 AirMicKit。

let arguments = Array(CommandLine.arguments.dropFirst())

func usage() {
    print("""
    airmicd —— AirMic 命令行服务端

    用法：
      airmicd serve                启动服务端（监听 + 广播 + 前台应用监听）
      airmicd serve --auto-approve 启动服务端并自动同意配对（开发用）
      airmicd serve --audio       同时打开音频管线（配合 airmicd tone 自测）
      airmicd serve --test-tone   打开 1kHz 测试音（验证「写设备」链路）
      airmicd pair-code            打印当前配对码
      airmicd devices              列出已配对设备
      airmicd config               打印当前配置（磁铁 / 预案）
      airmicd audio-devices        列出系统音频输出设备
      airmicd tone [主机] [端口] [秒数]  发一段测试音（验证音频链路）
      airmicd simulate-app <名称>  模拟一次前台应用切换（测试预案自动切换）
    """)
}

let server = AirMicServer()

switch arguments.first {
case "serve":
    if arguments.contains("--auto-approve") {
        server.autoApprovePairing = true
    }
    do {
        try server.start()
        print("AirMic 服务端已启动（设备 id：\(server.deviceId)）")
        print("配对码：\(server.pairCode.code)  有效期 \(server.pairCode.remainingSeconds) 秒")

        if arguments.contains("--test-tone") {
            // 只测输出链路：电脑自己发 1kHz，能听见就说明「写设备」这一步是通的
            server.toggleRecording()
            server.setTestTone(true)
            print("1kHz 测试音已开启（从电脑的输出设备出声）")
        } else if arguments.contains("--audio") {
            server.toggleRecording()
            print("音频管线已启动（UDP \(AudioReceiver.resolvedPort)）")
            // 每秒打印一次统计
            Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                let stats = server.stats
                let loss = stats.packetLoss.map { String(format: "%.1f%%", $0) } ?? "--"
                let latency = stats.latencyMs.map { String(format: "%.0fms", $0) } ?? "--"
                print("[audio] 丢包 \(loss) 欠载 \(stats.underruns ?? 0) 延迟 \(latency)")
            }
        }

        // 保持前台运行
        RunLoop.main.run()
    } catch {
        print("启动失败：\(error.localizedDescription)")
        exit(1)
    }

case "pair-code":
    let store = PairingCode()
    print(store.code)

case "devices":
    let store = PairingStore()
    let devices = store.allDevices()
    if devices.isEmpty {
        print("还没有配对过任何设备")
    } else {
        for device in devices {
            print("\(device.displayName)（\(device.model)）· \(device.id)")
        }
    }

case "config":
    let store = ConfigStore()
    let config = store.load()
    print("磁铁 \(config.magnets.count) 个，预案 \(config.presets.count) 套，修订号 \(config.revision)")
    for preset in config.presets {
        let bound = preset.appName ?? "（默认）"
        print("· \(preset.name)  绑定：\(bound)  磁贴：\(preset.tiles.count)")
    }

case "audio-devices":
    // 列出系统音频输出设备（排查下拉框为空）
    let list = AudioDeviceManager.outputDevices()
    if list.isEmpty {
        print("没有枚举到任何输出设备")
    }
    for device in list {
        print("\(device.id)  \(device.name)\(device.isVirtual ? "  [虚拟]" : "")")
    }

case "aactest":
    // 编解码自测：PCM → AAC → PCM，不经过网络
    do {
        try runAacTest()
    } catch {
        print("自测失败：\(error.localizedDescription)")
        exit(1)
    }

case "tone":
    // 电脑端音频自测：合成一段正弦波 → AAC 编码 → UDP 发到接收端
    // 用法：airmicd tone [目标主机] [目标端口] [秒数]
    let host = arguments.count > 1 ? arguments[1] : "127.0.0.1"
    let port = arguments.count > 2 ? UInt16(arguments[2]) ?? 47472 : 47472
    let seconds = arguments.count > 3 ? Double(arguments[3]) ?? 3 : 3
    do {
        try sendTone(host: host, port: port, seconds: seconds)
    } catch {
        print("测试音发送失败：\(error.localizedDescription)")
        exit(1)
    }

case "simulate-app":
    guard arguments.count > 1 else {
        print("用法：airmicd simulate-app <名称>")
        exit(1)
    }
    // 供开发期验证「前台应用 → 预案切换」用（真机上是系统事件驱动）
    print("提示：模拟前台应用需要 AirMicServer 的测试入口，正式版由系统事件驱动")

default:
    usage()
}

/// 编解码自测
func runAacTest() throws {
    let encoder = try AacEncoder(sampleRate: 48000, channels: 1, bitRate: 32000)
    let decoder = try AacDecoder(sampleRate: 48000, channels: 1)

    let frames = 1024
    var totalPcm = 0
    var totalOut = 0
    var firstAU: Data?

    for index in 0..<10 {
        var pcm = Data(capacity: frames * 2)
        for i in 0..<frames {
            let t = Double(index * frames + i) / 48000.0
            let value = Int16(sin(2 * .pi * 440 * t) * 0.3 * 32767)
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { pcm.append(contentsOf: $0) }
        }
        totalPcm += pcm.count

        guard let au = encoder.encode(pcm) else {
            print("第 \(index) 帧编码失败")
            continue
        }
        if firstAU == nil {
            firstAU = au
            print("首个 AU：\(au.count) 字节，前 8 字节 = \(au.prefix(8).map { String(format: "%02x", $0) }.joined(separator: " "))")
        }
        let out = decoder.decode(au)
        totalOut += out.count
        print("第 \(index) 帧：PCM \(pcm.count) → AU \(au.count) → 解码 \(out.count)")
    }
    print("合计：PCM \(totalPcm) → 解码 \(totalOut)")
}

/// 合成正弦波 → AAC 编码 → UDP 发出（用来验证音频链路）
func sendTone(host: String, port: UInt16, seconds: Double) throws {
    let encoder = try AacEncoder(sampleRate: 48000, channels: 1, bitRate: 32000)
    let sampleRate = 48000.0
    let frames = 1024
    let total = Int(sampleRate * seconds)

    let socket = try NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!, using: .udp)
    let queue = DispatchQueue(label: "airmic.tone")
    let ready = DispatchSemaphore(value: 0)
    var sendError: Error?
    socket.stateUpdateHandler = { state in
        if case .ready = state { ready.signal() }
        if case .failed(let error) = state { sendError = error; ready.signal() }
    }
    socket.start(queue: queue)
    ready.wait()

    var sequence: UInt16 = 0
    var sent = 0
    let start = Date()

    for offset in stride(from: 0, to: total, by: frames) {
        let count = min(frames, total - offset)
        var pcm = Data(capacity: count * 2)
        for index in 0..<count {
            let t = Double(offset + index) / sampleRate
            // 440Hz 正弦，幅度 0.3
            let value = Int16(sin(2 * .pi * 440 * t) * 0.3 * 32767)
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { pcm.append(contentsOf: $0) }
        }

        guard let au = encoder.encode(pcm) else { continue }

        var packet = Data()
        packet.append(UInt8((sequence >> 8) & 0xFF))
        packet.append(UInt8(sequence & 0xFF))
        let micros = UInt32(Date().timeIntervalSince(start) * 1_000_000)
        packet.append(UInt8((micros >> 24) & 0xFF))
        packet.append(UInt8((micros >> 16) & 0xFF))
        packet.append(UInt8((micros >> 8) & 0xFF))
        packet.append(UInt8(micros & 0xFF))
        packet.append(au)

        socket.send(content: packet, completion: .contentProcessed { error in
            if let error { sendError = error }
        })
        sequence &+= 1
        sent += 1
    }

    Thread.sleep(forTimeInterval: 0.3)
    socket.cancel()
    print("已发送 \(sent) 帧到 \(host):\(port)")
    if let sendError {
        print("发送出错：\(sendError.localizedDescription)")
    }
}
