# AirMic 0.5.1

把手机麦克风变成电脑麦克风，也把手机变成电脑遥控器。局域网直连，不经过服务器。

## 本次更新

- **文本磁片**：磁片新增「文本」类型，写一段文字，触发时电脑直接粘贴到前台输入框。支持多行、中文和 emoji。
- **长按绑定磁片组**：组里第一步跟着手指按住，松手后等待组间隔，其余步骤依次执行。
- **剪贴板保护**：连续粘贴多段文本时，只保留并还原你最早的剪贴板；粘贴约 1.2 秒后自动还原，不覆盖你中途复制的内容。
- **顺序修复**：快捷键和文本统一按消息顺序执行，磁片组里「文本 → 按键」不会乱序。
- **配置同步修复**：手机端存在磁片组磁贴时，电脑端配置不再整条解码失败。
- **稳定性**：手机断线时可靠松开仍按住的组合键；日志不再记录文本正文。

## 下载

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS 13+ | `AirMic-0.5.1-macOS.zip` | 解压后把 `AirMic.app` 拖进「应用程序」 |
| Android 6.0+ | `AirMic-v0.5.1-debug.apk` | Debug 签名，直接安装 |

**macOS 首次打开**：右键 → 打开；或执行 `xattr -dr com.apple.quarantine /Applications/AirMic.app`。
然后授予「辅助功能」权限，并安装 [BlackHole 2ch](https://existential.audio/blackhole/)。

**Android**：允许安装未知来源应用，授予麦克风和附近设备权限，手机和电脑连同一个 Wi-Fi。

## 校验

```
SHA256 (AirMic-0.5.1-macOS.zip)    7b7f321a5367b40ced4cc7a81ab0c6440b6f203f06b0272a53ef929de2b5c6d2
SHA256 (AirMic-v0.5.1-debug.apk)   31d1919c4dc2f502cd6f02998d1cec9dc3e0ed32b76b4399a2b505b096546ade
```

## 使用要求

- macOS 13 或更高版本；Android 6.0 或更高版本。
- 电脑需安装 BlackHole 2ch，其他软件把麦克风选为 BlackHole 2ch。
- 两端在同一局域网；访客 Wi-Fi / AP 隔离会导致扫描不到。
- 快捷键和文本粘贴需要 macOS「辅助功能」权限。

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
