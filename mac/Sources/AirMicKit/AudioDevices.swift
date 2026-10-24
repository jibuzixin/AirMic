import AudioToolbox
import Foundation

/// 电脑端可写入的音频输出（虚拟）设备。
///
/// AirMic 的声音要变成「电脑的麦克风」，就得写进一个虚拟设备 ——
/// v1 用 BlackHole，用户在系统声音设置里把 BlackHole 选为输入设备。
public struct AudioDevice: Identifiable, Equatable {
    public var id: String
    public var name: String
    /// 是不是虚拟设备（BlackHole 之类）
    public var isVirtual: Bool

    public init(id: String, name: String, isVirtual: Bool) {
        self.id = id
        self.name = name
        self.isVirtual = isVirtual
    }
}

/// 枚举系统音频输出设备。
public enum AudioDeviceManager {
    /// 列出所有带输出流的设备
    public static func outputDevices() -> [AudioDevice] {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &address, 0, nil, &size
        ) == noErr, size > 0 else { return [] }

        var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address, 0, nil, &size, &ids
        ) == noErr else { return [] }

        return ids.compactMap(deviceInfo(for:))
    }

    private static func deviceInfo(for id: AudioObjectID) -> AudioDevice? {
        // 必须有输出流
        var streamAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &streamAddress, 0, nil, &size) == noErr,
              size > 0 else { return nil }
        let buffer = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { buffer.deallocate() }
        guard AudioObjectGetPropertyData(id, &streamAddress, 0, nil, &size, buffer) == noErr else { return nil }
        let list = UnsafeMutableAudioBufferListPointer(buffer.assumingMemoryBound(to: AudioBufferList.self))
        guard list.reduce(0, { $0 + Int($1.mNumberChannels) }) > 0 else { return nil }

        let name = deviceName(id) ?? "未知设备"
        return AudioDevice(
            id: String(UInt32(id)),
            name: name,
            isVirtual: isVirtualDevice(id, name: name)
        )
    }

    private static func deviceName(_ id: AudioObjectID) -> String? {
        guard let value = copyStringProperty(id: id, selector: kAudioObjectPropertyName) else { return nil }
        return value
    }

    /// 读一个 CFString 类型的全局属性
    private static func copyStringProperty(id: AudioObjectID, selector: AudioObjectPropertySelector) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        var value: Unmanaged<CFString>?
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr,
              let string = value?.takeUnretainedValue()
        else { return nil }
        return string as String
    }

    /// 黑孔类虚拟设备的 UID 里带厂商标识，直接看名字更省事
    private static func isVirtualDevice(_ id: AudioObjectID, name: String) -> Bool {
        let markers = ["BlackHole", "Loopback", "Soundflower", "虚拟", "Virtual"]
        if markers.contains(where: { name.localizedCaseInsensitiveContains($0) }) { return true }
        guard let uid = copyStringProperty(id: id, selector: kAudioDevicePropertyDeviceUID) else { return false }
        return uid.contains("BlackHole") || uid.contains("Loopback")
    }
}
