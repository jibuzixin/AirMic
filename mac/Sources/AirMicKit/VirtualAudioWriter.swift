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

        streamFormat = Self.outputStreamFormat(for: deviceID)
        Log.info("虚拟设备格式：\(streamFormat.mSampleRate)Hz / \(streamFormat.mChannelsPerFrame)ch / \(streamFormat.mBitsPerChannel)bit")

        var newProcID: AudioDeviceIOProcID?
        let status = AudioDeviceCreateIOProcID(
            deviceID,
            { _, _, inputData, _, _, _, clientData in
                guard let clientData else { return noErr }
                let writer = Unmanaged<VirtualAudioWriter>.fromOpaque(clientData).takeUnretainedValue()
                writer.fill(inputData)
                return noErr
            },
            Unmanaged.passUnretained(self).toOpaque(),
            &newProcID
        )
        guard status == noErr, let newProcID else {
            throw WriterError.createProcFailed(status)
        }
        procID = newProcID

        // 真正带上下文的回调（上面那个只是占位，见 startDeviceIOProc）
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
    }

    /// 缓冲里还剩多少采样
    public var queuedFrames: Int {
        buffer.availableFrames
    }

    /// 在 IO 回调里把环形缓冲里的 PCM 填进设备缓冲
    ///
    /// ⚠️ 这是实时线程：不要在这里分配内存、不要加锁超过必要时间。
    private func fill(_ inputData: UnsafePointer<AudioBufferList>) {
        let buffers = UnsafeMutableAudioBufferListPointer(
            UnsafeMutablePointer(mutating: inputData)
        )
        guard buffers.count > 0 else { return }

        let channels = Int(streamFormat.mChannelsPerFrame)
        let bytesPerSample = Int(streamFormat.mBitsPerChannel / 8)
        let bytesPerFrame = bytesPerSample * channels
        let isFloat = streamFormat.mFormatFlags & kAudioFormatFlagIsFloat != 0
        let isSigned = streamFormat.mFormatFlags & kAudioFormatFlagIsSignedInteger != 0
        let isInterleaved = streamFormat.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0

        // 这一轮要写多少帧
        let frames = buffers[0].mDataByteSize / UInt32(max(bytesPerFrame, 1))

        // 测试音：直接生成 1kHz 正弦波
        if testToneEnabled {
            let step = 2 * Double.pi * 1000 / streamFormat.mSampleRate
            for index in 0..<Int(frames) {
                let value = Float(sin(testTonePhase)) * 0.25
                testTonePhase += step
                if testTonePhase > 2 * Double.pi { testTonePhase -= 2 * Double.pi }
                let sample = Int16(value * 32767)
                for bufferIndex in 0..<buffers.count {
                    guard let data = buffers[bufferIndex].mData else { continue }
                    let capacity = Int(buffers[bufferIndex].mDataByteSize)
                    let stride = capacity / max(Int(frames), 1)
                    let offset = min(index * stride, max(capacity - bytesPerSample, 0))
                    if isFloat {
                        var out = value
                        if bytesPerSample == 4 {
                            memcpy(data.advanced(by: offset), &out, 4)
                        } else {
                            var half = Float16(value)
                            memcpy(data.advanced(by: offset), &half, 2)
                        }
                    } else {
                        var out = UInt16(bitPattern: sample)
                        memcpy(data.advanced(by: offset), &out, min(bytesPerSample, 2))
                    }
                }
            }
            return
        }

        // 欠载 → 补静音
        guard let mono = buffer.read(frames: Int(frames)) else {
            for index in 0..<buffers.count {
                if let data = buffers[index].mData {
                    memset(data, 0, Int(buffers[index].mDataByteSize))
                }
            }
            return
        }

        for index in 0..<buffers.count {
            guard let data = buffers[index].mData else { continue }
            let capacity = Int(buffers[index].mDataByteSize)

            if isInterleaved {
                var offset = 0
                for frame in 0..<mono.count {
                    for channel in 0..<channels {
                        var value = Self.convert(
                            mono[frame], isFloat: isFloat, isSigned: isSigned
                        )
                        if offset + bytesPerSample <= capacity {
                            memcpy(data.advanced(by: offset), &value, bytesPerSample)
                        }
                        offset += bytesPerSample
                    }
                }
            } else {
                let stride = buffers[index].mDataByteSize / UInt32(max(Int(frames), 1))
                for frame in 0..<mono.count {
                    var value = Self.convert(
                        mono[frame], isFloat: isFloat, isSigned: isSigned
                    )
                    let offset = Int(stride) * frame
                    if offset + bytesPerSample <= capacity {
                        memcpy(data.advanced(by: offset), &value, bytesPerSample)
                    }
                }
            }
        }
    }

    /// 单声道 Int16 → 目标采样格式
    private static func convert(_ sample: Int16, isFloat: Bool, isSigned: Bool) -> UInt32 {
        if isFloat {
            var out = Float(sample) / 32768.0
            return withUnsafeBytes(of: &out) { raw in
                raw.loadUnaligned(as: UInt32.self)
            }
        }
        if isSigned {
            var out = UInt16(bitPattern: sample)
            return withUnsafeBytes(of: &out) { raw in
                UInt32(raw.loadUnaligned(as: UInt16.self))
            }
        }
        var out = UInt32(sample)
        return withUnsafeBytes(of: &out) { raw in
            raw.loadUnaligned(as: UInt32.self)
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
