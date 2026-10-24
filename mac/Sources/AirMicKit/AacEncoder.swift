import AudioToolbox
import CoreAudioTypes
import Foundation

/// AAC-LC 编码器（macOS 原生 AudioConverter）。
///
/// 用途：
/// - 手机端用 `MediaCodec` 编码，电脑端用 `AacDecoder` 解码；
/// - 这个编码器是**对称的**，给电脑端的自测工具用（不发真的手机也能验证链路）。
public final class AacEncoder {

    private var converter: AudioConverterRef?
    private let context = EncodeContext()

    public let sampleRate: Double
    public let channels: UInt32
    public let framesPerPacket: UInt32 = 1024
    public let bitRate: Int

    public init(sampleRate: Double = 48000, channels: UInt32 = 1, bitRate: Int = 32000) throws {
        self.sampleRate = sampleRate
        self.channels = channels
        self.bitRate = bitRate

        var inFormat = AudioStreamBasicDescription(
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
        var outFormat = AudioStreamBasicDescription(
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

        var converterRef: AudioConverterRef?
        let status = AudioConverterNew(&inFormat, &outFormat, &converterRef)
        guard status == noErr, let converterRef else {
            throw EncoderError.cannotCreate(status)
        }
        converter = converterRef

        // 目标码率
        var rate = bitRate
        withUnsafeBytes(of: &rate) { raw in
            AudioConverterSetProperty(
                converterRef,
                kAudioConverterEncodeBitRate,
                UInt32(MemoryLayout<Int>.size),
                raw.baseAddress!
            )
        }
    }

    deinit {
        if let converter {
            AudioConverterDispose(converter)
        }
    }

    /// 编码一帧 PCM16（1024 采样），返回 AAC 访问单元
    public func encode(_ pcm: Data) -> Data? {
        guard let converter else { return nil }
        context.pcm = pcm
        context.provided = false

        // 输出缓冲：一帧 AAC 大约几百字节，留 4KB
        let capacity = 4096
        let storage = UnsafeMutablePointer<UInt8>.allocate(capacity: capacity)
        defer { storage.deallocate() }

        var outList = AudioBufferList(
            mNumberBuffers: 1,
            mBuffers: AudioBuffer(
                mNumberChannels: channels,
                mDataByteSize: UInt32(capacity),
                mData: storage
            )
        )

        var packetSize: UInt32 = 1
        let status = AudioConverterFillComplexBuffer(
            converter,
            { _, ioNumberDataPackets, ioData, outPacketDescription, userData in
                guard let userData else { return noErr }
                let ctx = Unmanaged<EncodeContext>.fromOpaque(userData).takeUnretainedValue()
                guard let pcm = ctx.pcm, !ctx.provided else {
                    ioNumberDataPackets.pointee = 0
                    return noErr
                }
                ctx.provided = true

                let buffers = UnsafeMutableAudioBufferListPointer(ioData)
                buffers[0].mDataByteSize = UInt32(pcm.count)
                if let destination = buffers[0].mData {
                    pcm.withUnsafeBytes { raw in
                        if let base = raw.baseAddress {
                            memcpy(destination, base, pcm.count)
                        }
                    }
                }

                let packet = AudioStreamPacketDescription(
                    mStartOffset: 0,
                    mVariableFramesInPacket: ctx.framesPerPacket,
                    mDataByteSize: UInt32(pcm.count)
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

        if status != noErr {
            Log.debug("AAC 编码失败：\(status)")
            return nil
        }
        let produced = Int(outList.mBuffers.mDataByteSize)
        guard produced > 0 else { return nil }
        return Data(bytes: storage, count: produced)
    }

    private final class EncodeContext {
        var pcm: Data?
        var provided = false
        var framesPerPacket: UInt32 = 1024
        let packetPointer: UnsafeMutablePointer<AudioStreamPacketDescription> =
            UnsafeMutablePointer<AudioStreamPacketDescription>.allocate(capacity: 1)

        init() {
            packetPointer.pointee = AudioStreamPacketDescription(
                mStartOffset: 0,
                mVariableFramesInPacket: 1024,
                mDataByteSize: 0
            )
        }
    }

    public enum EncoderError: LocalizedError {
        case cannotCreate(OSStatus)

        public var errorDescription: String? {
            switch self {
            case .cannotCreate(let status):
                return "AAC 编码器创建失败（\(status)）"
            }
        }
    }
}
