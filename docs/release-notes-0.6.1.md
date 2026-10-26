# AirMic 0.6.1

修复 0.6.0 里「打开 App 一直显示重新连接，但自动连不上，必须点换设备重选一次」的问题。

## 原因

自动重连一直在用**上次保存的电脑地址**。电脑休眠 / DHCP 续租后 IP 可能变了，
旧地址连不上；而「换设备」会重新扫 mDNS，所以手动选一次就能连上。

另外，原来的重连循环依赖 App 的前后台事件。部分机型上这个事件可能漏发，
导致循环根本没有启动，界面就一直停在「正在重新连接…」。

## 修复

- **自动重新发现**：自动重连失败后，会在局域网里重新扫一次 `_airmic._tcp`，
  按电脑 id / 名字找到它，更新地址和端口再连。不需要手动点「换设备」。
- **回到 App 时先扫一次**：手机熄屏或切后台超过 2 秒后回来，如果当前没在收音，
  会顺手刷新一次电脑地址，再重建连接。
- **不再依赖前后台事件启动重连**：即使系统漏发 `appStateChange`，断线重试循环也会运行。
- **更短的等待**：局域网连接超时从 5 秒降到 2.5 秒；另加 8 秒看门狗，
  原生连接如果卡住不会把重试永久挡住。
- **重连提示降噪**：麦克风页的提示从整条按钮改成一行小字 + 一个会呼吸的琥珀色小圆点；
  失败后显示「连接不上，点此重试」，右侧保留低调的「换设备」。
- **扫描结束自动停**：mDNS 扫描 3 秒后自动停止并释放组播锁（顺手修的耗电问题）。

## 下载

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS 13+ | `AirMic-0.6.1-macOS.zip` | 解压后把 `AirMic.app` 拖进「应用程序」 |
| Android 6.0+ | `AirMic-v0.6.1-debug.apk` | Debug 签名，直接安装 |

**macOS 首次打开**：右键 → 打开；或执行 `xattr -dr com.apple.quarantine /Applications/AirMic.app`。
然后授予「辅助功能」权限，并安装 [BlackHole 2ch](https://existential.audio/blackhole/)。

**Android**：允许安装未知来源应用，授予麦克风和附近设备权限，手机和电脑连同一个 Wi-Fi。

## 校验

```
SHA256 (AirMic-0.6.1-macOS.zip)    c3a26497a3821894481b4efd2b415301720c0016f0cb080a223f74cfb9980380
SHA256 (AirMic-v0.6.1-debug.apk)   5ffa76c8c081531dbcf338b32160b6fa6fd65415fbeb00d7f4143b0c4c8d3926
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
