import AudioToolbox
import CoreAudioTypes
import Foundation

/// AAC-LC 解码器（macOS 原生 AudioConverter）。
///
/// ⚠️ 为什么不直接用 Opus：macOS 的 `AudioConverter` **不支持 Opus**
/// （`AudioFormatGetProperty('opus')` 返回 -50）。AAC-LC 两端都原生支持：
/// 安卓 `MediaCodec` 编码，macOS `AudioConverter` 解码，零外部依赖。
///
/// 一帧 AAC-LC = 1024 个采样（48kHz 下约 21.3ms）。
public final class AacDecoder {

    private var converter: AudioConverterRef?
    private let context = DecodeContext()
    /// 连续解不出的次数
    private var consecutiveEmpty = 0

    public let sampleRate: Double
    public let channels: UInt32
    /// 一帧的采样数（AAC-LC 固定 1024）
    public static let framesPerPacket: UInt32 = 1024
    public var framesPerPacket: UInt32 { AacDecoder.framesPerPacket }

    public init(sampleRate: Double = 48000, channels: UInt32 = 1) throws {
        self.sampleRate = sampleRate
        self.channels = channels

        var inFormat = AudioStreamBasicDescription(
            mSampleRate: sampleRate,
            mFormatID: kAudioFormatMPEG4AAC,
            mFormatFlags: AudioFormatFlags(MPEG4ObjectID(rawValue: 2)!.rawValue), // AAC-LC
            mBytesPerPacket: 0,
            mFramesPerPacket: 1024,
            mBytesPerFrame: 0,
            mChannelsPerFrame: channels,
            mBitsPerChannel: 0,
            mReserved: 0
        )
        // 输出格式：一包 = 一帧 AAC（1024 采样）
        var outFormat = AudioStreamBasicDescription(
            mSampleRate: sampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked,
            mBytesPerPacket: 2,
            mFramesPerPacket: 1,
            mBytesPerFrame: 2,
            mChannelsPerFrame: channels,
            mBitsPerChannel: 16,
            mReserved: 0
        )

        var converterRef: AudioConverterRef?
        let status = AudioConverterNew(&inFormat, &outFormat, &converterRef)
        guard status == noErr, let converterRef else {
            throw DecoderError.cannotCreate(status)
        }
        converter = converterRef
    }

    deinit {
        if let converter {
            AudioConverterDispose(converter)
        }
    }

    /// 复位解码器
    ///
    /// ⚠️ AudioConverter 一旦在输入回调里拿到「0 个包」，可能进入 EOF 状态并**一直**
    /// 停在那里 —— 表现为「第一次说话有声音，停了再开就再也不出声音」。
    /// 所以连续解不出时必须把它 reset 掉。
    public func reset() {
        if let converter {
            AudioConverterReset(converter)
        }
        context.queue.removeAll()
        consecutiveEmpty = 0
    }

    /// 解码一个 AAC 访问单元，返回 PCM16 字节（可能是空 —— 前几帧是编码器 priming）
    public func decode(_ accessUnit: Data) -> Data {
        guard let converter else { return Data() }
        context.queue.append(accessUnit)
        context.framesPerPacket = framesPerPacket

        // 输出缓冲：一帧的量（1024 采样 × 2 字节）
        let capacity = Int(framesPerPacket) * 2
        let storage = UnsafeMutablePointer<UInt8>.allocate(capacity: capacity)
        defer { storage.deallocate() }

        // AAC 解码器有 priming 与内部缓冲：一个 AU 不一定立刻产出 PCM，
        // 所以要一直喂到它吐出数据为止。
        for _ in 0..<8 {
            var outList = AudioBufferList(
                mNumberBuffers: 1,
                mBuffers: AudioBuffer(
                    mNumberChannels: channels,
                    mDataByteSize: UInt32(capacity),
                    mData: storage
                )
            )
            // ⚠️ 输出包大小是「帧数」不是字节数。
            // 给 1024（= 一帧的采样数）时，转换器解完一个 AU 就停；
            // 给大了它会想要更多输入，队列空了就会进 EOF 状态，之后再也不产出。
            var packetSize = framesPerPacket

            let status = AudioConverterFillComplexBuffer(
                converter,
                { _, ioNumberDataPackets, ioData, outPacketDescription, userData in
                    guard let userData else { return noErr }
                    let ctx = Unmanaged<DecodeContext>.fromOpaque(userData).takeUnretainedValue()
                    guard let au = ctx.queue.first else {
                        // 没有输入了
                        ioNumberDataPackets.pointee = 0
                        return noErr
                    }
                    ctx.queue.removeFirst()

                    let buffers = UnsafeMutableAudioBufferListPointer(ioData)
                    buffers[0].mDataByteSize = UInt32(au.count)
                    if let destination = buffers[0].mData {
                        au.withUnsafeBytes { raw in
                            if let base = raw.baseAddress {
                                memcpy(destination, base, au.count)
                            }
                        }
                    }

                    let packet = AudioStreamPacketDescription(
                        mStartOffset: 0,
                        mVariableFramesInPacket: ctx.framesPerPacket,
                        mDataByteSize: UInt32(au.count)
                    )
                    ctx.packetPointer.pointee = packet
                    outPacketDescription?.pointee = ctx.packetPointer
                    ioNumberDataPackets.pointee = 1
                    return noErr
                },
                Unmanaged.passUnretained(context).toOpaque(),
                &packetSize,
                &outList,
                nil
            )

            if status == -43 /* kAudioConverterErr_EOF */ {
                // 转换器说没数据了
                break
            }
            if status != noErr && status != kAudioConverterErr_InvalidInputSize {
                Log.debug("AAC 解码失败：\(status)")
                return Data()
            }

            let produced = Int(outList.mBuffers.mDataByteSize)
            if produced > 0 {
                consecutiveEmpty = 0
                return Data(bytes: storage, count: produced)
            }
            // 没产出就继续喂 —— AAC 解码器有 priming 与内部缓冲
        }
        // 连续解不出 → 复位，避免卡在 EOF
        consecutiveEmpty += 1
        if consecutiveEmpty >= 3 {
            AudioConverterReset(converter)
            consecutiveEmpty = 0
            Log.debug("解码器连续解不出数据，已复位")
        }
        return Data()
    }

    /// 上下文：把待解码的 AU 传给 C 回调
    private final class DecodeContext {
        /// 待解码的 AAC 访问单元队列
        var queue: [Data] = []
        var framesPerPacket: UInt32 = 1024
        var packet = AudioStreamPacketDescription(
            mStartOffset: 0,
            mVariableFramesInPacket: 1024,
            mDataByteSize: 0
        )
        /// 包描述的指针（回调里要交出去，得一直活着）
        let packetPointer: UnsafeMutablePointer<AudioStreamPacketDescription> =
            UnsafeMutablePointer<AudioStreamPacketDescription>.allocate(capacity: 1)

        init() {
            packetPointer.pointee = packet
        }
    }

    public enum DecoderError: LocalizedError {
        case cannotCreate(OSStatus)

        public var errorDescription: String? {
            switch self {
            case .cannotCreate(let status):
                return "AAC 解码器创建失败（\(status)）"
            }
        }
    }
}
