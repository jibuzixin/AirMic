# AirMic 0.6.0

把手机麦克风变成电脑麦克风，也把手机变成电脑遥控器。局域网直连，不经过服务器。

## 本次更新

### 熄屏保活

- 手机锁屏 / 退到后台后，AirMic 会用一个**低优先级前台服务**保持与电脑的控制通道，不再几分钟就断连。
- 这个服务**不采集麦克风**、不持有 WakeLock，只在通知栏留一条「已连接 · 保持连接」；真正收音时自动切回麦克风模式，共用同一条通知。
- 电脑端心跳调整为：收音时 2 秒一次，空转时 10 秒一次；手机原生层直接回 pong，WebView 在后台被挂起也不影响。

### 断线不再跳回扫描页

- 以前断线 3 秒就退回设备页，熄屏回来每次都要重新连。
- 现在留在麦克风页显示「正在重新连接…」，前台自动退避重连（300ms → 30 秒）。
- 回到 App 时如果离开超过 2 秒且没在收音，会强制重建一次 TCP，避免旧 socket 看起来还连着、实际已经僵死。
- 只有配对失效，或用户主动点「断开连接」/「解绑设备」，才会回设备页。

### 闲置断开

设置 → 省电 → **闲置后断开连接**：

- 30 分钟 / 1 小时（默认）/ 2 小时 / 不自动断开。
- 只在**手机在后台且没有收音**时计时；使用中或录音中不会计时。
- 超时断开后，下次打开 App 仍然自动重连，不会跳到设备页。

### 其他修复

- 首次配对后会立即保存电脑地址和 token，同一会话里断线也能自动重连（之前要等下次冷启动）。
- 原生事件监听器现在会正确释放，避免重复注册、重复处理消息。

## 下载

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS 13+ | `AirMic-0.6.0-macOS.zip` | 解压后把 `AirMic.app` 拖进「应用程序」 |
| Android 6.0+ | `AirMic-v0.6.0-debug.apk` | Debug 签名，直接安装 |

**macOS 首次打开**：右键 → 打开；或执行 `xattr -dr com.apple.quarantine /Applications/AirMic.app`。
然后授予「辅助功能」权限，并安装 [BlackHole 2ch](https://existential.audio/blackhole/)。

**Android**：允许安装未知来源应用，授予麦克风和附近设备权限，手机和电脑连同一个 Wi-Fi。

## 校验

```
SHA256 (AirMic-0.6.0-macOS.zip)    f595618cf19644f455ebb095343c5f21fc806bbce02d58e702e16ba85254a81d
SHA256 (AirMic-v0.6.0-debug.apk)   edd9fecedc0801c09762dcbd0385658b829aa3eded1d2d8e5bfe17747de23ff4
```

## 使用要求

- macOS 13 或更高版本；Android 6.0 或更高版本。
- 电脑需安装 BlackHole 2ch，其他软件把麦克风选为 BlackHole 2ch。
- 两端在同一局域网；访客 Wi-Fi / AP 隔离会导致扫描不到。
- 快捷键和文本粘贴需要 macOS「辅助功能」权限。
- 保活依赖 Android 前台服务，通知栏会有一条常驻提示。部分品牌（三星、vivo、小米等）的电池策略仍可能杀后台；如遇到断连，请把 AirMic 的电池设置改成「不受限制」。

## 已知限制

- Android APK 使用 Debug 签名，未上架应用商店。
- macOS 应用使用项目自签名证书，首次启动会有 Gatekeeper 提示。
- 目前只支持局域网，不支持跨网络 / NAT 穿透。
- iOS 客户端尚未开发。

## 许可证

AirMic 使用 MIT License。原型中的部分动效组件来自
[EasyUI](https://github.com/Surajmaurya1/easyui)（MIT，© 2026 Suraj Maurya），
完整第三方声明见仓库的 `THIRD_PARTY_NOTICES.md`。

完整说明见仓库的 README 与 `docs/技术方案.md`。
