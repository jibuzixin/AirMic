import Foundation
import Network

/// 接收手机推来的音频（UDP）。
///
/// 包格式（见 shared/protocol.md）：
/// ```
/// seq(u16) | ts(u32, 微秒) | AAC 访问单元
/// ```
public final class AudioReceiver {

    /// 音频端口（与控制端口分开）
    public static let defaultPort: UInt16 = 47472

    /// 实际端口：跟随控制端口 +1，可用 `AIRMIC_PORT` 覆盖
    public static var resolvedPort: UInt16 {
        if let raw = ProcessInfo.processInfo.environment["AIRMIC_PORT"],
           let port = UInt16(raw), port > 0 {
            return port &+ 1
        }
        return defaultPort
    }
    /// 包头长度
    static let headerBytes = 6

    private var listener: NWListener?
    private let decoder: AacDecoder
    private let writer: VirtualAudioWriter
    private let bufferMs: Int

    /// 统计
    private(set) var receivedPackets = 0
    /// 已解码出的采样数
    private(set) var decodedFrames = 0
    private(set) var lostPackets = 0
    private(set) var underruns = 0
    private(set) var jitterMs: Double?
    private(set) var lastArrival: TimeInterval?

    private var expectedSequence: UInt16?
    private var lastTimestampMicros: UInt32?

    public init(decoder: AacDecoder, writer: VirtualAudioWriter, bufferMs: Int) {
        self.decoder = decoder
        self.writer = writer
        self.bufferMs = bufferMs
    }

    /// UDP 服务端要用 NWListener —— NWConnection 只能主动连出去
    public func start(port: UInt16 = AudioReceiver.resolvedPort) throws {
        stop()
        let parameters = NWParameters.udp
        parameters.allowLocalEndpointReuse = true

        let listener = try NWListener(
            using: parameters,
            on: NWEndpoint.Port(rawValue: port) ?? .any
        )
        self.listener = listener

        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                Log.info("音频接收已就绪，UDP 端口 \(port)")
            case .failed(let error):
                Log.error("音频接收失败：\(error.localizedDescription)")
            default:
                break
            }
        }
        // UDP 的每个数据报都是一个「新连接」
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener.start(queue: .global(qos: .userInitiated))
    }

    public func stop() {
        listener?.cancel()
        listener = nil
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: .global(qos: .userInitiated))
        receive(on: connection)
    }

    /// UDP 的每个数据报单独收，收完要**继续订阅** ——
    /// 注意：UDP 收完一个数据报就会报 isComplete，不能拿它当结束条件，
    /// 否则只有第一个包能收到。
    private func receive(on connection: NWConnection) {
        connection.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.handle(data)
            }
            if let error {
                Log.debug("音频接收出错：\(error.localizedDescription)")
                return
            }
            self.receive(on: connection)
        }
    }

    /// 拆包 → 解码 → 写进虚拟设备
    private func handle(_ data: Data) {
        guard data.count > AudioReceiver.headerBytes else { return }
        let payload = data.dropFirst(AudioReceiver.headerBytes)
        let sequence = data.withUnsafeBytes { raw -> UInt16 in
            let bytes = raw.bindMemory(to: UInt8.self)
            return (UInt16(bytes[0]) << 8) | UInt16(bytes[1])
        }
        let timestamp = data.withUnsafeBytes { raw -> UInt32 in
            let bytes = raw.bindMemory(to: UInt8.self)
            return (UInt32(bytes[2]) << 24) | (UInt32(bytes[3]) << 16) | (UInt32(bytes[4]) << 8) | UInt32(bytes[5])
        }

        receivedPackets += 1

        // 丢包统计：序号跳变
        if let expected = expectedSequence {
            let delta = UInt16(truncatingIfNeeded: sequence &- expected)
            if delta > 1 && delta < 1000 {
                lostPackets += Int(delta - 1)
            }
        }
        expectedSequence = sequence &+ 1

        // 抖动：用「到达间隔」与「发送时间戳间隔」的差估计
        //
        // ⚠️ 单向延迟算不出来 —— 两端时钟不同步，硬算就是编数字。
        // 所以延迟这一栏在拿到真实数据前显示 `[--]`（设计契约 §10）。
        let now = ProcessInfo.processInfo.systemUptime
        if let lastArrival, let lastTimestampMicros {
            let arrivalDelta = now - lastArrival
            let sendDelta = Double(timestamp &- lastTimestampMicros) / 1_000_000
            let jitter = abs(arrivalDelta - sendDelta) * 1000
            jitterMs = jitterMs.map { $0 * 0.8 + jitter * 0.2 } ?? jitter
        }
        lastArrival = now
        lastTimestampMicros = timestamp

        // 解码并写入
        let pcm = decoder.decode(Data(payload))
        if pcm.isEmpty {
            // 前几帧是编码器 priming，不算欠载
            return
        }
        decodedFrames += pcm.count / 2
        if decodedFrames % (1024 * 50) == 0 {
            // 每 50 帧（约 1 秒）报一次
            Log.info("已解码 \(decodedFrames / 1024) 帧（\(decodedFrames) 采样）")
        }
        writer.enqueue(pcm16: pcm)
    }

    /// 当前统计（拿不到真实值就留空，界面显示 `[--]`）
    public func stats(bufferMs: Int) -> Stats {
        let loss: Double? = receivedPackets > 0
            ? Double(lostPackets) / Double(receivedPackets + lostPackets) * 100
            : nil
        return Stats(
            packetLoss: loss,
            jitterMs: jitterMs,
            underruns: underruns,
            latencyMs: nil
        )
    }
}
