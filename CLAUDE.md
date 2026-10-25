# AirMic —— 给 AI 的项目说明

> 读完这份文件，你应该能直接在这个仓库里干活。
> 更细的架构与踩坑在 `docs/技术方案.md`；产品逻辑在 `prototype/需求说明书.md`；
> 视觉契约在 `prototype/DESIGN.md`。**原型是交互与视觉的真相源，不要推翻它。**

---

## 1. 这是什么

**AirMic = 把手机麦克风变成电脑麦克风，同时把手机变成电脑遥控器。**

- **电脑端**：macOS 菜单栏应用，不占 Dock。纯 Swift / SwiftUI / AppKit，没有 WebView。
- **手机端**：Android App。Capacitor + React（复用原型的手机 UI）+ Java 原生插件。
- **通信**：局域网。TCP 控制通道 + UDP 音频 + Bonjour 发现。协议见 `shared/protocol.md`。

最终形态：`AirMic-<版本>.app` + `AirMic-v<版本>-debug.apk`。

---

## 2. 快速开始

```bash
cd airmic
./scripts/setup-env.sh        # 只第一次：把 JDK21 / Android SDK / Node24 装进 .toolchain/
source scripts/env.sh         # 每个终端都要
```

**电脑端**

```bash
cd mac
swift build                   # 编译（CommandLineTools 足够，不需要完整 Xcode）
./.build/debug/airmicd serve --auto-approve   # 命令行服务端（开发/排查）
cd .. && ./scripts/package-mac.sh             # 打包 → dist/mac/AirMic-<版本>.app
```

**手机端**

```bash
cd android
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug         # → android/android/app/build/outputs/apk/debug/
```

**图标 / 版本**

- 图标源文件在 `assets/icon*.svg`，改完跑 `./scripts/make-icons.sh` 重新生成两端所有尺寸。
- 升版本要同时改三处：
  - `scripts/package-mac.sh` 的 `VERSION`
  - `android/android/app/build.gradle` 的 `versionCode` / `versionName`
  - `android/src/components/phone/SettingsPage.tsx` 里显示的版本号

---

## 3. 目录结构

```
airmic/
├── mac/                         电脑端（SwiftPM）
│   ├── Sources/AirMicKit/         服务端内核
│   │   ├── AirMicServer.swift       总装：状态、配对、预案、快捷键、音频管线
│   │   ├── ControlServer.swift      TCP 47471 + Bonjour `_airmic._tcp`
│   │   ├── AudioReceiver.swift      UDP 47472 收包 → 解码 → 写设备
│   │   ├── AacDecoder.swift / AacEncoder.swift  AAC-LC 编解码（AudioConverter）
│   │   ├── VirtualAudioWriter.swift CoreAudio IOProc，把 PCM 写进 BlackHole
│   │   ├── AudioDevices.swift       音频设备枚举 / 默认设备选择
│   │   ├── HotkeyExecutor.swift     CGEvent 快捷键（tap / press / repeat / release）
│   │   ├── TextPaster.swift         文本磁片：剪贴板 + ⌘V，粘完还原原剪贴板
│   │   ├── ForegroundAppWatcher.swift 前台应用监听（NSWorkspace）
│   │   ├── PairingStore.swift       已配对设备 + 长期 token（文件存储）
│   │   ├── ConfigStore.swift        磁片/预案配置（Application Support）
│   │   ├── Diagnostics.swift        文件日志（~/Library/Logs/AirMic/airmic.log）
│   │   └── Models/Messages/...
│   ├── Sources/AirMac/           菜单栏 App（AppKit NSPanel + SwiftUI 内容）
│   │   ├── MenuBarController.swift  状态栏、面板窗口、毛玻璃、外部点击关闭
│   │   ├── PanelView.swift          318pt 面板布局
│   │   ├── Theme.swift              动态颜色（浅色/深色）
│   │   └── AppState.swift           服务端状态转发
│   └── Sources/airmicd/          命令行服务端 + 一堆自测命令（见 §7）
│
├── android/                     手机端（Capacitor 工程根）
│   ├── src/                       React 界面
│   │   ├── lib/airmic-store.tsx     全局状态（接口形状沿用原型）
│   │   ├── lib/transport.ts         原生通道封装（扫描/连接/推流/系统栏）
│   │   ├── lib/back-stack.tsx       安卓返回键栈（优先级：页面0 < 抽屉10 < 选择器20 < 编辑器30）
│   │   ├── lib/haptics.ts           震动
│   │   ├── lib/custom-icons.ts      用户上传的图标（本地）
│   │   └── components/phone/        麦克风页/设备页/预案/设置/磁片库/磁片组...
│   └── android/app/src/main/java/com/airmic/phone/   原生插件（Java）
│       ├── AirMicPlugin.java         Capacitor 插件入口
│       ├── DeviceScanner.java        mDNS 扫描（组播锁）
│       ├── ControlClient.java        TCP + JSON Lines
│       ├── MicCapture.java           AudioRecord → AAC → UDP（线程生命周期）
│       ├── AirmicMicService.java     前台服务（保活）
│       └── TokenStore.java           长期 token
│
├── prototype/                   原型（**交互/视觉真相源，别删**）
├── shared/protocol.md           局域网协议
├── docs/技术方案.md              架构决策、踩坑、诊断（比本文更细）
├── assets/                      图标源文件 + AppIcon.icns
├── tools/fake-phone.mjs         假手机端（协议联调）
└── scripts/                     环境、打包、图标生成
```

---

## 4. 架构与数据流

### 4.1 通道

| 通道 | 端口/方式 | 内容 |
|---|---|---|
| 发现 | Bonjour `_airmic._tcp` | 手机手动扫描一次（不轮询） |
| 控制 | TCP **47471** JSON Lines | `hello/welcome`、配对、状态、配置、快捷键、ping/pong |
| 音频 | UDP **47472** | 6 字节头（seq u16 + ts u32）+ AAC-LC 帧 |

端口可用 `AIRMIC_PORT` 环境变量改（音频 = 控制端口 +1），避免同机多开冲突。

### 4.2 配对

- 手机连上先发 `hello`（带 `token`）。
- 已配对 → 电脑端直接放行；未配对 → `welcome.pairingRequired=true`，
  手机在用户点了设备后才发 `pair.request`，电脑端弹「允许/拒绝」。
- **配对码已移除**，不要恢复。
- 长期 token 存在 `~/Library/Application Support/AirMic/pairing.json`（手机在 SharedPreferences）。

### 4.3 配置以电脑端为准

手机端编辑磁片/预案 → 全量 `config.push` 给电脑端 → 电脑端存 `config.json`。
电脑端需要配置是因为**磁贴按下是在电脑上执行的**。

### 4.4 快捷键语义

| 操作 | 消息 | 电脑端行为 |
|---|---|---|
| 点磁贴 / 点按麦克风 | `hotkey.execute` | keyDown + keyUp（一次） |
| 长按磁贴 / 长按说话 | `hotkey.down` | keyDown，**0.35s 后每 60ms 重复**（模拟系统连发） |
| 松手 | `hotkey.up` | 松开主键 + 逐个松开修饰键（必须真的发修饰键事件） |

### 4.5 音频管线

```
手机：AudioRecord(48k/mono) → MediaCodec(AAC-LC, 20ms 帧) → UDP
电脑：AudioReceiver → AacDecoder → RingBuffer → VirtualAudioWriter(IOProc) → BlackHole
```

用户需安装 BlackHole，并在系统「声音 → 输入」里选它。电脑端默认优先选虚拟设备。

### 4.6 录音状态

- 电脑端**启动即收音**（`autoRecordOnLaunch`）。
- 静默 30 秒（两端默认，可调 0–120s）自动停止收音。
- **静默自动关** → 手机开始说话时电脑自动恢复。
- **用户手动关** → 手机怎么按都不恢复。
- 电脑端把 `stoppedByUser` 随 `state` 下发，手机只在用户手动关时才提示。

### 4.7 预案自动切换

前台应用变化 → 按 `preset.appIds` 匹配 → 切换并广播 `preset.active` → 手机顶部常驻条更新。
一个应用只属于一个预案（手机端 `updatePreset` 强制）。

### 4.8 文本磁片

磁片有两种：`text` 非空 = **文本磁片**（存一段提前编辑好的文字），否则是快捷键磁片。

- 手机端发 `text.paste`；电脑端 `TextPaster` 把文字写入剪贴板 → 激活前台应用 → 发 ⌘V
  → 1 秒后（剪贴板仍是这段文字时）还原用户原来的剪贴板。
- 用剪贴板而不用 Unicode 注入：`CGEvent.keyboardSetUnicodeString` 会被 Electron / Flutter /
  远程桌面等直接丢掉；⌘V 是所有应用都认的路径。
- 没有键可以「按住」，所以文本磁片在长按位置就是**按下时粘贴一次**。
  磁片组绑到长按时，组里**第一个有组合键的步骤**才是按住的那一个。

---

## 5. 数据模型（两端一致）

```ts
Magnet      { id, label, icon, modifiers[], key?|mouse?, text? }  // icon 可为 custom:<key>；text 非空 = 文本磁片
Preset      { id, name, appIds[], micPressId?, micReleaseId?, micHoldId?, micHoldGroupId?, tiles[], isDefault? }
Tile        { id, magnetId? | groupId? }                    // 二选一
MagnetGroup { id, name, icon, steps: magnetId[], intervalSeconds }
```

**不变量**

- `micPressId`（点按开）、`micReleaseId`（点按关）只能绑磁片；`micHoldId`（长按磁片）和 `micHoldGroupId`（长按磁片组）二选一。
- 长按绑磁片组时：组里第一个**有组合键**的步骤按住，松手释放，先等 `intervalSeconds`，剩下的步骤再按同样间隔依次执行（在手机端发 `hotkey.down/up/execute` 实现）。文本步骤没有「按住」语义，按下时粘贴。
- 磁贴引用磁片**或**磁片组；磁片组按顺序执行，可重复同一个磁片。
- 删除磁片要清掉所有引用（预案槽位、磁贴、磁片组步骤、磁片组磁贴）。

---

## 6. 设计约束（违反即 bug）

完整契约见 `prototype/DESIGN.md`，这里只列最容易踩的：

- 禁止纯黑 `#000000`；最深 `#0B0B0D`。琥珀 `#FFB020` 是稀缺资源（一个视图一处主操作）。
- 绿色=已连接/麦克风开，红色=正在收音/危险，不混用。
- 所有数字用等宽 + `tabular-nums`。
- 动效只用 spring；面板里不要做内容布局动画（窗口高度由 `MenuBarController` 单独动画）。
- 手机端麦克风页**完全不滚动**；磁贴固定 3×2，不足补空位。
- 不造假数据：没有真实值就显示 `[--]`。
- 文案：说人话、主动语态、错误要写「发生了什么 + 怎么修」。

电脑端外观：`NSStatusItem` + 无边框 `NSPanel` + `NSVisualEffectView(.hudWindow)`，
用 `maskImage` 做 16pt 连续圆角（`layer.cornerRadius` 裁不掉 vibrancy）。
**不要改回 SwiftUI `MenuBarExtra`**（窗口不透明 + 自动改高度，做不出真毛玻璃且展开会叠影）。

---

## 7. 开发与排查工具

```bash
cd mac
./.build/debug/airmicd serve [--auto-approve] [--audio] [--test-tone]
./.build/debug/airmicd audio-devices        # 列系统音频设备
./.build/debug/airmicd loopback-test        # 写 440Hz 进 BlackHole 再从输入读回来
./.build/debug/airmicd tone 127.0.0.1 47472 3   # 发测试音（配合 --audio）
./.build/debug/airmicd aactest / aacgap     # 编解码自测 / 重启恢复测试
./.build/debug/airmicd keycode a t space    # 查虚拟键码
```

```bash
node tools/fake-phone.mjs --pair            # 假手机：配对
node tools/fake-phone.mjs --hotkey cmd+t    # 假手机：快捷键
node tools/fake-phone.mjs --text "你好"      # 假手机：文本磁片（text.paste）
AIRMIC_PORT=47482 node tools/fake-phone.mjs # 换端口（避免和正在跑的 App 冲突）
```

电脑端日志：`~/Library/Logs/AirMic/airmic.log`，面板「详细设置 → 复制诊断日志」可一键复制。
收音时每秒一行：`[AUDIO] recv= / decoded= / rendered= / peak=`，按这三个值定位卡在哪一环。

---

## 8. 踩过的坑（别重踩）

| 症状 | 原因 | 正确做法 |
|---|---|---|
| 授权了辅助功能但程序说没有 | ad-hoc 签名每次编译都变，TCC 失效 | 用 `.toolchain/signing` 里的自签名证书（`scripts/setup-signing.sh`），**别改回 ad-hoc**；换签名后需在系统设置里删掉旧条目重新添加 |
| 电脑完全听不到声音 | `AudioDeviceIOProc` 第 3 个参数是输入，第 5 个才是输出 | 写 `outOutputData` |
| 解码永远只出 1 个采样 | `AudioConverterFillComplexBuffer` 的输出包大小参数是**帧数**，不是字节 | 传 1024（一帧采样数） |
| 停了再说话就再也解不出 | AudioConverter 卡在 EOF | `decode` 连续空 3 次就 `AudioConverterReset`；手机每次开始收音也复位解码器 |
| 只有第一个 UDP 包能收到 | `receiveMessage` 的 `isComplete` 在 UDP 上每个包都为真 | 不看 `isComplete`，继续订阅 |
| 快捷键只有 ⌘Space 能用 | 字母的虚拟键码不是 ASCII（`kVK_ANSI_V`=9） | 查 `HotkeyExecutor.keyCode` 的 ANSI 表 |
| 按磁贴没反应、像闪退 | 两个 AirMic 实例抢端口 | 单实例保护 + 先退出旧实例；真机排查看诊断日志 |
| 电脑端面板展开/收起内容叠在一起 | `MenuBarExtra` 自己在改窗口高度 | 用 NSPanel，高度只由我们动画 |
| 安卓返回键直接退到桌面 | 没有返回栈 / 依赖注册顺序 | `back-stack.tsx`，按优先级排队 |
| 长按触发系统选字/菜单 | WebView 默认允许选择 | `index.css` 里全局 `user-select/touch-callout: none`，输入框例外 |
| 电脑端配置一直不更新 | 手机推的磁贴带 `groupId`（磁片组），电脑端 `Tile.magnetId` 必填 → 整条 `config.push` 解码失败 | `Tile.magnetId` 可选；`sanitize` 保留 `groupId` 磁贴 |
| 开麦瞬间「噗」一声 | AAC 编码器 priming 瞬态 | 写入端每段音频开始强制 15ms 淡入 |
| 长时间不说话耗电 | 常开收音一直在编码 | 静默自动关（默认 30s，两端可调）；电平事件限频 12 次/秒 |
| 震动没反应 | WebView 需要权限 | `AndroidManifest.xml` 的 `VIBRATE` |

---

## 9. 修改指南（recipes）

**加一条协议消息**
1. `mac/Sources/AirMicKit/Messages.swift`：加类型常量 + 字段
2. `AirMicServer.handle(...)`：加处理
3. `android/src/lib/airmic-store.tsx`：`onMessage` 里加 case（必要时 `transport.send` 回包）
4. `shared/protocol.md`：补文档

**文本磁片**：判定用 `magnetIsText`，显示用 `magnetDisplay`，能否触发用 `magnetIsBound`。
新增会触发磁片的地方都要同时处理 `text.paste`，不要只判断 `magnetCombo`（文本磁片的 combo 是空的）。

**加一个图标**：`android/src/components/phone/icons.tsx` 的 `ICON_CHOICES` 里加一行即可
（`TILE_ICONS` 会自动生成，避免再出现「选了却显示成 Copy」）。

**加一个设置项**：`settings` 页（`SettingsPage.tsx`）+ store 的 `Persisted`/状态/动作 +
必要的协议字段。

**改视觉 token**：电脑端 `mac/Sources/AirMac/Theme.swift`；手机端 `android/src/index.css` 的
`@theme` / `html[data-theme='light']`。

**改电脑端面板布局**：`PanelView.swift`。宽度固定 318，注意 `SectionCard` 分组与高度上报
（`PanelHeightKey` → `MenuBarController.contentHeightChanged`）。

---

## 10. 当前状态

已完成并验证（本机）：协议握手、配对（请求/允许）与免确认重连、
快捷键 tap/hold/repeat、电脑端音频全段（UDP→AAC→BlackHole，0 丢包）、
编解码无损、两端打包、图标、静默省电、返回栈、震动、磁片组。

**还需要真机/用户配合验证**：手机 ↔ 电脑的 mDNS 扫描与推流、BlackHole 实际录音、
辅助功能授权后的真实按键、预案随前台应用切换的整条 UI 链路。

**已知未做**：自研 AudioDriverKit 虚拟设备（v2，需要 Apple entitlement）、
iOS 端（原型里有 iOS 尺寸，但没排期）、统计里的「抖动」目前是到达间隔估算。

---

## 11. 环境注意

- `.toolchain/` 是项目内工具链（JDK 21、Android SDK 35、Node 24、Gradle 缓存、签名证书），
  **不要提交**，也不要改用户全局环境。`source scripts/env.sh` 生效。
- npm 必须用 `.toolchain/node` 里的 Node 24（Node 20 的 npm 装依赖会崩）。
- 构建产物、`dist/`、`node_modules/`、`.build/`、`assets/build/` 都在 `.gitignore` 里。
- 只有在 `dist/` 里保留**最新版本**的 `.app` 和 `.apk`，旧版本不要堆着。
