# AirMic 0.6.2

这版专门修「不够丝滑」和「断连时点麦克风闪退」。

## 修复

### 回到 App 不再先断一下

- 0.6.1 每次回到 App 都会强制重建连接，所以打开时总会先看到「重新连接中」。
- 现在如果连接还在，就直接继续用；手机在后台发一个 `ping`，电脑端回 `pong` 做健康检查。
  只有 2 秒没回包才标记断线、重新扫描地址并重连。
- 电脑端不支持这个能力（老版本）时，手机会跳过健康检查，不会误判断线。

### 断连时点麦克风不再闪退

- **JS 先拦截**：没连接时点麦克风只提示「正在连接电脑，稍等一下」，并立即触发一次重连，
  不会去启动采集。
- **原生再检查**：`startMic` 会确认控制通道真的还活着，不再拿旧地址启动服务；
  `startForegroundService` 的异常也会被捕获并返回错误，而不是崩掉插件。
- **采集防重入**：上一次采集线程还没退出时，新的采集会拒绝启动，避免两个线程同时操作
  AudioRecord / MediaCodec 导致进程崩溃。
- 采集失败会自动把界面回滚到待机，不会假装正在收音。

### 功耗与内存

- 回前台不再做无谓的强制重连和 mDNS 扫描，只有真断了才扫。
- mDNS 扫描 3 秒后自动停止并释放组播锁。
- 连接保活仍然不持有 WakeLock，空转心跳 10 秒一次；闲置超时可断开。
- 频域电平表是静态的，只有真实采集时才更新。

## 下载

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS 13+ | `AirMic-0.6.2-macOS.zip` | 解压后把 `AirMic.app` 拖进「应用程序」 |
| Android 6.0+ | `AirMic-v0.6.2-debug.apk` | Debug 签名，直接安装 |

> 建议手机端和电脑端都更新到 0.6.2。电脑端提供 `welcome.features = ["ping"]`，
> 手机端才能做无感的连接健康检查。

**macOS 首次打开**：右键 → 打开；或执行 `xattr -dr com.apple.quarantine /Applications/AirMic.app`。
然后授予「辅助功能」权限，并安装 [BlackHole 2ch](https://existential.audio/blackhole/)。

**Android**：允许安装未知来源应用，授予麦克风和附近设备权限，手机和电脑连同一个 Wi-Fi。

## 校验

```
SHA256 (AirMic-0.6.2-macOS.zip)    d76223e27e1774e0cd74c022b4b641513f791df03ab950bda7871587db39728b
SHA256 (AirMic-v0.6.2-debug.apk)   c6187d0dd90aa211a8d912b316f91b63bfc7837bd9eb74651c32b500e7d81072
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
