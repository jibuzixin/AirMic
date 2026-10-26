# AirMic 0.6.4

修复「熄屏几分钟就断连，不是说要等 1 小时吗」以及「回来还要等一会」。

## 先说明 1 小时是什么意思

设置里的「闲置后断开」是**我们主动断开**的计时：手机在后台、没有收音，超过这个时间才释放连接。

你遇到的断连不是这个计时器，而是**手机熄屏后，系统让 Wi-Fi 进入省电 / 杀后台，TCP 连接先被网络或系统断掉了**。所以看起来像没到 1 小时就断。

## 本次修复

- **熄屏期间持有 Wi-Fi 锁**：App 退到后台且没有收音时，短暂持有 `WIFI_MODE_FULL_HIGH_PERF`，避免 Wi-Fi 进入省电导致 TCP 被断；回到前台、开始收音、断线或到达闲置时间会立刻释放。
  - 功耗是有代价的，但只在「后台保活」期间，并且受你设置的闲置时间约束（默认 1 小时）。
- **设置里新增「允许后台运行（系统电池设置）」**：直接打开系统的电池优化设置，把 AirMic 设为「不受限制」。三星 / vivo / 小米等系统即使有前台服务也可能杀后台，这一步是给这些系统的兜底。
- **回到 App 先用上次地址秒连，同时并行扫描**：
  - 地址没变 → 几十毫秒连上，不用等扫描；
  - 地址变了 → 扫描完（约 3 秒）用新地址连上；
  - 不再每次都先干等一次扫描。
- **Mac 端防 App Nap**：菜单栏应用没有窗口时，macOS 会降低后台定时器和网络回调的频率。现在服务端运行期间持有 App Nap 抑制，心跳更稳定（仍然允许 Mac 空闲睡眠，不会强行阻止休眠）。
- 补充了 Wi-Fi 锁、保活服务、闲置计时的日志，方便排查。

## 下载

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS 13+ | `AirMic-0.6.4-macOS.zip` | 解压后把 `AirMic.app` 拖进「应用程序」 |
| Android 6.0+ | `AirMic-v0.6.4-debug.apk` | Debug 签名，直接安装 |

**建议两端都更新**：Mac 端的 App Nap 修复在 0.6.4。

**安装后建议做一次**：设置 → 省电 → 点「允许后台运行（系统电池设置）」，把 AirMic 设为「不受限制」。这一步只需要做一次。

**macOS 首次打开**：右键 → 打开；或执行 `xattr -dr com.apple.quarantine /Applications/AirMic.app`。
然后授予「辅助功能」权限，并安装 [BlackHole 2ch](https://existential.audio/blackhole/)。

## 校验

```
SHA256 (AirMic-0.6.4-macOS.zip)    ee368dec4f57c6bfe9b39d8b205f6905b89331f6ad7f8c00557f03b1392dcbc0
SHA256 (AirMic-v0.6.4-debug.apk)   d92867b2e1ffac5300ed66270041242e3de79fdbf7e60dee911ae61559b6c7d2
```

## 如果还是断

说明是更底层的系统行为（例如 Wi-Fi 被系统直接关闭、或厂商的省电策略仍然杀进程）。在电脑上执行：

```bash
adb logcat -s AirMicPlugin AirMicControl AirMicService AirMicScan AndroidRuntime
```

重点看：

- `熄屏保活：持有 Wi-Fi 锁` / `释放 Wi-Fi 锁` —— 锁有没有正常拿到和释放；
- `连接保活服务已启动` —— 前台服务有没有起来；
- `后台闲置计时` —— 有没有提前触发；
- `连接断开` 前面的异常信息。

把这几行附近的日志发我，就能判断是网络、系统杀进程还是 Mac 端问题。

## 已知限制

- Android APK 使用 Debug 签名，未上架应用商店。
- macOS 应用使用项目自签名证书，首次启动会有 Gatekeeper 提示。
- 目前只支持局域网，不支持跨网络 / NAT 穿透。
- iOS 客户端尚未开发。
- 熄屏保活期间持有 Wi-Fi 锁会增加一点耗电，闲置时间到达后自动释放。

## 许可证

AirMic 使用 MIT License。原型中的部分动效组件来自
[EasyUI](https://github.com/Surajmaurya1/easyui)（MIT，© 2026 Suraj Maurya），
完整第三方声明见仓库的 `THIRD_PARTY_NOTICES.md`。

完整说明见仓库的 README 与 `docs/技术方案.md`。
