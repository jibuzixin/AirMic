import CoreAudio
import Foundation

/// 把 PCM 写进系统里的虚拟音频设备（BlackHole），让它变成一个「电脑麦克风」。
///
/// 用 CoreAudio 的 `AudioDeviceIOProc`：直接接管设备的输出数据流，
/// 在 IO 回调里把收到的 PCM 填进去。BlackHole 把它「播放」给自己，
/// 于是系统里就多了一个「从手机来的麦克风」。
///
/// ⚠️ BlackHole 需要用户自己装一次（AirMic 只做引导，不分发驱动）。
public final class VirtualAudioWriter {

    private var procID: AudioDeviceIOProcID?
    private var deviceID: AudioDeviceID = 0
    private let buffer: RingBuffer

    /// 目标设备的流格式
    /// 1kHz 测试音：打开后忽略收到的 PCM，直接生成正弦波 ——
    /// 用来分清「手机没采到音」还是「电脑没写出去」
    private var testToneEnabled = false
    private var testTonePhase: Double = 0

    /// 开关 1kHz 测试音
    public func setTestTone(_ enabled: Bool) {
        testToneEnabled = enabled
        if !enabled { testTonePhase = 0 }
    }

    public var isTestToneEnabled: Bool { testToneEnabled }

    private var streamFormat = AudioStreamBasicDescription(
        mSampleRate: 48000,
        mFormatID: kAudioFormatLinearPCM,
        mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
        mBytesPerPacket: 8,
        mFramesPerPacket: 1,
        mBytesPerFrame: 8,
        mChannelsPerFrame: 2,
        mBitsPerChannel: 32,
        mReserved: 0
    )

    public init(capacityFrames: Int = 48000) {
        buffer = RingBuffer(capacityFrames: capacityFrames)
    }

    public var isRunning: Bool { procID != nil }

    /// 启动写入
    public func start(deviceID: AudioDeviceID) throws {
        stop()
        self.deviceID = deviceID

        // 重新开始收音时把自检数据清零
        renderedFrames = 0
        peakAmplitude = 0
        underrunCount = 0
        hasReceivedAudio = false

        streamFormat = Self.outputStreamFormat(for: deviceID)
        Log.info("虚拟设备格式：\(streamFormat.mSampleRate)Hz / \(streamFormat.mChannelsPerFrame)ch / \(streamFormat.mBitsPerChannel)bit")

        var newProcID: AudioDeviceIOProcID?
        let status = AudioDeviceCreateIOProcID(
            deviceID,
            // 参数顺序：device, now, **inInputData**, inInputTime,
            //           **outOutputData**, inOutputTime, clientData
            // ⚠️ 必须写第 5 个（输出），写第 3 个（输入）等于什么都没输出
            { _, _, _, _, outputData, _, clientData in
                guard let clientData else { return noErr }
                let writer = Unmanaged<VirtualAudioWriter>.fromOpaque(clientData).takeUnretainedValue()
                writer.fill(outputData)
                return noErr
            },
            Unmanaged.passUnretained(self).toOpaque(),
            &newProcID
        )
        guard status == noErr, let newProcID else {
            throw WriterError.createProcFailed(status)
        }
        procID = newProcID

        let startStatus = AudioDeviceStart(deviceID, newProcID)
        guard startStatus == noErr else {
            AudioDeviceDestroyIOProcID(deviceID, newProcID)
            procID = nil
            throw WriterError.startFailed(startStatus)
        }
        Log.info("已写入虚拟设备：\(deviceID)")
    }

    public func stop() {
        guard let procID else { return }
        AudioDeviceStop(deviceID, procID)
        AudioDeviceDestroyIOProcID(deviceID, procID)
        self.procID = nil
    }

    deinit {
        stop()
    }

    /// 塞一段 PCM16 单声道数据进环形缓冲
    public func enqueue(pcm16: Data) {
        buffer.write(pcm16)
        hasReceivedAudio = true
    }

    /// 缓冲里还剩多少采样
    public var queuedFrames: Int {
        buffer.availableFrames
    }

    /// 欠载次数（缓冲里没数据，只能补静音）
    public private(set) var underrunCount = 0
    /// 已经真正写进设备输出缓冲的帧数（排查「有没有写出去」用）
    public private(set) var renderedFrames = 0
    /// 写出去的最大振幅（0–1）
    public private(set) var peakAmplitude: Double = 0
    /// 收到过音频没有 —— 没收到之前的「空回调」不算欠载
    private var hasReceivedAudio = false

    /// 在 IO 回调里把环形缓冲里的 PCM 填进设备输出缓冲
    ///
    /// ⚠️ 这是实时线程：不要在这里分配内存、不要做重活。
    private func fill(_ outputData: UnsafeMutablePointer<AudioBufferList>) {
        let buffers = UnsafeMutableAudioBufferListPointer(outputData)
        guard buffers.count > 0 else { return }

        let channels = max(1, Int(streamFormat.mChannelsPerFrame))
        let bytesPerSample = max(1, Int(streamFormat.mBitsPerChannel / 8))
        let isFloat = streamFormat.mFormatFlags & kAudioFormatFlagIsFloat != 0
        let isInterleaved = streamFormat.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0

        // 帧数：交错时一个 buffer 装所有声道；非交错时每个 buffer 一个声道
        let bytesPerFrame = bytesPerSample * (isInterleaved ? channels : 1)
        let frames = Int(buffers[0].mDataByteSize) / max(bytesPerFrame, 1)
        guard frames > 0 else { return }

        // 测试音：直接生成 1kHz 正弦波（用来验证「写设备」这一段）
        if testToneEnabled {
            let step = 2 * Double.pi * 1000 / streamFormat.mSampleRate
            for frame in 0..<frames {
                let tone = sin(testTonePhase) * 0.25
                renderedFrames += 1
                if abs(tone) > peakAmplitude { peakAmplitude = abs(tone) }
                writeSample(
                    tone,
                    frame: frame,
                    buffers: buffers,
                    channels: channels,
                    bytesPerSample: bytesPerSample,
                    isFloat: isFloat,
                    isInterleaved: isInterleaved
                )
                testTonePhase += step
                if testTonePhase > 2 * Double.pi { testTonePhase -= 2 * Double.pi }
            }
            return
        }

        // 欠载：没有数据就补静音（收到过音频之后才算真欠载）
        guard let mono = buffer.read(frames: frames) else {
            if hasReceivedAudio { underrunCount += 1 }
            for index in 0..<buffers.count {
                if let data = buffers[index].mData {
                    memset(data, 0, Int(buffers[index].mDataByteSize))
                }
            }
            return
        }

        for frame in 0..<mono.count {
            let sample = Double(mono[frame]) / 32768.0
            renderedFrames += 1
            if abs(sample) > peakAmplitude { peakAmplitude = abs(sample) }
            writeSample(
                sample,
                frame: frame,
                buffers: buffers,
                channels: channels,
                bytesPerSample: bytesPerSample,
                isFloat: isFloat,
                isInterleaved: isInterleaved
            )
        }
    }

    /// 把同一个采样写进所有声道
    private func writeSample(
        _ value: Double,
        frame: Int,
        buffers: UnsafeMutableAudioBufferListPointer,
        channels: Int,
        bytesPerSample: Int,
        isFloat: Bool,
        isInterleaved: Bool
    ) {
        if isInterleaved {
            guard buffers.count > 0, let data = buffers[0].mData else { return }
            let capacity = Int(buffers[0].mDataByteSize)
            let base = frame * channels * bytesPerSample
            for channel in 0..<channels {
                writeOne(
                    value,
                    to: data,
                    offset: base + channel * bytesPerSample,
                    bytesPerSample: bytesPerSample,
                    isFloat: isFloat,
                    capacity: capacity
                )
            }
        } else {
            for index in 0..<buffers.count {
                guard let data = buffers[index].mData else { continue }
                writeOne(
                    value,
                    to: data,
                    offset: frame * bytesPerSample,
                    bytesPerSample: bytesPerSample,
                    isFloat: isFloat,
                    capacity: Int(buffers[index].mDataByteSize)
                )
            }
        }
    }

    /// 按设备实际格式写一个采样（float16/32/64、int16/32）
    private func writeOne(
        _ value: Double,
        to data: UnsafeMutableRawPointer,
        offset: Int,
        bytesPerSample: Int,
        isFloat: Bool,
        capacity: Int
    ) {
        guard offset >= 0, offset + bytesPerSample <= capacity else { return }
        if isFloat {
            switch bytesPerSample {
            case 2:
                var v = Float16(value)
                memcpy(data + offset, &v, 2)
            case 8:
                var v = value
                memcpy(data + offset, &v, 8)
            default:
                var v = Float(value)
                memcpy(data + offset, &v, 4)
            }
        } else {
            switch bytesPerSample {
            case 4:
                var v = Int32(clamping: Int((value * 2_147_483_647).rounded()))
                memcpy(data + offset, &v, 4)
            default:
                var v = Int16(clamping: Int((value * 32_767).rounded()))
                memcpy(data + offset, &v, 2)
            }
        }
    }

    // MARK: - 设备格式

    /// 设备的输出流格式
    private static func outputStreamFormat(for deviceID: AudioDeviceID) -> AudioStreamBasicDescription {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamFormat,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var format = AudioStreamBasicDescription(
            mSampleRate: 48000,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
            mBytesPerPacket: 8,
            mFramesPerPacket: 1,
            mBytesPerFrame: 8,
            mChannelsPerFrame: 2,
            mBitsPerChannel: 32,
            mReserved: 0
        )
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        if AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &format) != noErr {
            Log.debug("读不到设备流格式，用 48k/双声道/浮点默认值")
        }
        return format
    }

    public enum WriterError: LocalizedError {
        case createProcFailed(OSStatus)
        case startFailed(OSStatus)

        public var errorDescription: String? {
            switch self {
            case .createProcFailed(let s): return "音频 IO 回调创建失败（\(s)）"
            case .startFailed(let s): return "音频设备启动失败（\(s)）"
            }
        }
    }
}

/// 单生产者单消费者的环形缓冲（解码线程写，渲染线程读）。
final class RingBuffer {
    private var storage: [Int16]
    private var writeIndex = 0
    private var readIndex = 0
    private var available = 0
    private let lock = NSLock()
    private let capacity: Int

    init(capacityFrames: Int) {
        capacity = max(capacityFrames, 1024)
        storage = [Int16](repeating: 0, count: capacity)
    }

    var availableFrames: Int {
        lock.lock()
        defer { lock.unlock() }
        return available
    }

    /// 写入 PCM16 数据（缓冲满了丢最旧的）
    func write(_ data: Data) {
        let samples = data.withUnsafeBytes { raw -> [Int16] in
            let buffer = raw.bindMemory(to: Int16.self)
            return Array(buffer)
        }
        guard !samples.isEmpty else { return }

        lock.lock()
        defer { lock.unlock() }
        for sample in samples {
            storage[writeIndex] = sample
            writeIndex = (writeIndex + 1) % capacity
            if available < capacity {
                available += 1
            } else {
                readIndex = (readIndex + 1) % capacity
            }
        }
    }

    /// 读 frames 个采样；不够就返回 nil（欠载）
    func read(frames: Int) -> [Int16]? {
        lock.lock()
        defer { lock.unlock() }
        guard available >= frames else { return nil }
        var result = [Int16](repeating: 0, count: frames)
        for index in 0..<frames {
            result[index] = storage[readIndex]
            readIndex = (readIndex + 1) % capacity
        }
        available -= frames
        return result
    }
}
