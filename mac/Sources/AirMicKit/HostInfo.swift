import Foundation

/// 电脑端的身份信息。
public enum HostInfo {
    /// 菜单栏和手机端设备列表里显示的名字
    public static var displayName: String {
        let host = Host.current().localizedName ?? ""
        return host.isEmpty ? "Mac" : host
    }

    /// 稳定设备 id：第一次启动时生成，存进 UserDefaults，之后不再变。
    /// 手机端靠它识别「这台电脑」。
    public static var stableId: String {
        let key = "airmic.deviceId"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let generated = "mac-" + UUID().uuidString.prefix(8)
        UserDefaults.standard.set(generated, forKey: key)
        return generated
    }

    /// Bonjour 服务名（同一个局域网里不能重名）
    public static var bonjourServiceName: String {
        let name = displayName
        return name.isEmpty ? "AirMac" : name
    }
}
