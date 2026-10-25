import AirMicKit
import CoreAudio
import Foundation

/// 虚拟设备回环自测
/// ------------------------------------------------------------
/// 把测试音写进虚拟设备（BlackHole），再从**同一个设备的输入**读回来。
/// 这样不用手机、不用录音软件，就能验证「写 → 设备 → 读」整条回路。
///
/// 用途：用户报告「电脑听不到」时，先用它把范围缩到「设备/写法」还是「手机/网络」。
final class LoopbackProbe {

    private var procID: AudioDeviceIOProcID?
    private var deviceID: AudioDeviceID = 0
    private var format = AudioStreamFormat.defaultValue

    private(set) var peak: Double = 0
    private(set) var frameCount = 0
    private(set) var callbackCount = 0

    func start(deviceID: AudioDeviceID) throws {
        self.deviceID = deviceID
        format = AudioStreamFormat.inputFormat(for: deviceID)

        var newProcID: AudioDeviceIOProcID?
        // 参数顺序：device, now, **inInputData**, inInputTime, outOutputData, inOutputTime, clientData
        let status = AudioDeviceCreateIOProcID(
            deviceID,
            { _, _, inputData, _, _, _, clientData in
                guard let clientData else { return noErr }
                let probe = Unmanaged<LoopbackProbe>.fromOpaque(clientData).takeUnretainedValue()
                probe.handle(inputData)
                return noErr
            },
            Unmanaged.passUnretained(self).toOpaque(),
            &newProcID
        )
        guard status == noErr, let newProcID else {
            throw NSError(
                domain: "AirMic.Loopback",
                code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "创建录音回调失败（\(status)）"]
            )
        }
        procID = newProcID

        let startStatus = AudioDeviceStart(deviceID, newProcID)
        guard startStatus == noErr else {
            AudioDeviceDestroyIOProcID(deviceID, newProcID)
            procID = nil
            throw NSError(
                domain: "AirMic.Loopback",
                code: Int(startStatus),
                userInfo: [NSLocalizedDescriptionKey: "设备启动失败（\(startStatus)）"]
            )
        }
    }

    func stop() {
        guard let procID else { return }
        AudioDeviceStop(deviceID, procID)
        AudioDeviceDestroyIOProcID(deviceID, procID)
        self.procID = nil
    }

    deinit { stop() }

    /// 读出输入缓冲里的最大值
    private func handle(_ inputData: UnsafePointer<AudioBufferList>) {
        callbackCount += 1
        let buffers = UnsafeMutableAudioBufferListPointer(
            UnsafeMutablePointer(mutating: inputData)
        )
        for buffer in buffers {
            guard let data = buffer.mData else { continue }
            let bytes = Int(buffer.mDataByteSize)
            guard bytes > 0 else { continue }

            if format.isFloat {
                let count = bytes / 4
                let pointer = data.bindMemory(to: Float.self, capacity: count)
                for index in 0..<count {
                    let value = abs(Double(pointer[index]))
                    if value > peak { peak = value }
                }
                frameCount += count / max(Int(format.channels), 1)
            } else {
                let count = bytes / 2
                let pointer = data.bindMemory(to: Int16.self, capacity: count)
                for index in 0..<count {
                    let value = abs(Double(pointer[index]) / 32768.0)
                    if value > peak { peak = value }
                }
                frameCount += count / max(Int(format.channels), 1)
            }
        }
    }
}

/// 设备流格式的简化版
struct AudioStreamFormat {
    var sampleRate: Double = 48000
    var channels: UInt32 = 2
    var bitsPerChannel: UInt32 = 32
    var isFloat = true

    static let defaultValue = AudioStreamFormat()

    static func inputFormat(for deviceID: AudioDeviceID) -> AudioStreamFormat {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamFormat,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        var asbd = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        guard AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &asbd) == noErr else {
            return .defaultValue
        }
        return AudioStreamFormat(
            sampleRate: asbd.mSampleRate,
            channels: max(1, asbd.mChannelsPerFrame),
            bitsPerChannel: max(16, asbd.mBitsPerChannel),
            isFloat: asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0
        )
    }
}
