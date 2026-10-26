# AirMic 局域网协议 v1

> 两端：电脑端 = 服务端（macOS），手机端 = 客户端（Android）。
> 传输：同一局域网（Wi-Fi），三种通道，各管一件事。

| 通道 | 协议 | 用途 | 特性 |
|---|---|---|---|
| 发现 | Bonjour / mDNS `_airmic._tcp` | 手机找到电脑 | 手机端**手动**扫描一次，不轮询 |
| 控制 | TCP + JSON Lines | 配对、状态、快捷键、预案同步 | 可靠、有序、低频 |
| 音频 | UDP + AAC-LC | 手机麦克风 → 电脑 | 低延迟，允许丢包（靠抖动缓冲吸收） |

刻意保持**单连接、少字段**：一个手机一次只连一台电脑。

---

## 1. 发现

- 电脑端用 Bonjour 广播 `_airmic._tcp`（TCP）。
- TXT 记录携带：`name`（设备名）、`id`（稳定设备 id）、`v`（协议版本）、`state`（收音中/空闲）。
- 手机端扫描 `_airmic._tcp` → 拿到 `{id, name, host, port}`。
- Android 注意：mDNS 收包需要 `WifiManager.MulticastLock`；Android 13+ 需要 `NEARBY_WIFI_DEVICES` 权限。

**手动扫描策略**（需求说明书 §3.2）：进入设备页扫一次，之后只靠用户点刷新。持续轮询费电。

---

## 2. 控制通道（TCP + JSON Lines）

每行一个 JSON 对象，以 `\n` 结束。UTF-8。最大 64KB/行。

### 2.1 通用字段

```jsonc
{ "type": "...", "id": "可选的请求 id（用于配对）" }
```

### 2.2 消息一览

#### 连接建立

| 方向 | type | 载荷 | 说明 |
|---|---|---|---|
| 客户端→电脑 | `hello` | `protocolVersion, deviceId, deviceName, model, token?` | `token` 为空表示未配对 |
| 电脑→客户端 | `welcome` | `sessionId, pairingRequired, features?, server:{...}` | 配对成功时 `pairingRequired=false`；`features` 是可选能力列表（0.6.2+ 含 `"ping"`） |
| 电脑→客户端 | `hello.reject` | `reason` | 协议版本不符 |

#### 配对

| 方向 | type | 载荷 | 说明 |
|---|---|---|---|
| 客户端→电脑 | `pair.request` | `deviceId, deviceName, model` | 只有**未配对**设备才发 |
| 电脑→客户端 | `pair.request.recv` | — | 电脑端弹确认 |
| 电脑→客户端 | `pair.respond` | `approved: Bool, token?` | 同意则下发长期 token |

配对只有一条路径：**手机点设备 → 电脑端「允许 / 拒绝」**。配对码已移除。
长期 token：32 字节随机，Base64，存 macOS 本地文件；手机端存本地。

**已配对设备点一下直接连上**：客户端带 token 的 `hello` → 电脑端校验通过 → `welcome`，不再弹任何确认。

#### 状态同步（电脑 → 客户端）

| type | 载荷 | 触发时机 |
|---|---|---|
| `state` | `recording, foregroundApp, foregroundBundleId, outputDeviceId, bufferMs` | 任意状态变化 |
| `preset.active` | `presetId, name, appName, fallback` | 前台应用变化导致预案切换 |
| `stats` | `packetsLost, jitterMs, underruns, latencyMs` | 每秒一次（仅排查时用） |
| `mic.state` | `mode: idle\|continuous\|ptt` | 电脑端收音状态变化（用于手机端震动提示） |

> `mic.state` 是「电脑端没有在收音，手机开始收音要震动 + 提示」的数据来源（硬约束 15）。

#### 配置（手机 → 电脑）

预案和磁铁的编辑入口在手机端，但**配置以电脑端为准**（磁贴按下要在电脑上执行，电脑必须知道键位）。
手机端每次连接后推送一次全量，之后增量修改。

| 方向 | type | 载荷 |
|---|---|---|
| 客户端→电脑 | `config.push` | `{ magnets: [...], presets: [...] }` 全量 |
| 电脑→客户端 | `config.ack` | `{ revision: Int }` |
| 客户端→电脑 | `config.update` | `{ magnets: [...], presets: [...] }` 全量（改动小也走全量，字段少不值得做 diff） |

#### 执行（手机 → 电脑）

| type | 载荷 | 说明 |
|---|---|---|
| `hotkey.execute` | `{ combo: ["cmd","shift","v"] }` | 点按语义：按下并立即松开 |
| `hotkey.down` | `{ combo: [...] }` | 长按语义：**按下但不松开** |
| `hotkey.up` | `{ combo: [...] }` | 长按语义：松开之前按下的组合键 |
| `text.paste` | `{ text: "你好" }` | 文本磁片：把这段文字粘贴到电脑的前台应用 |
| `mic.state` | `{ mode }` | 手机麦克风按钮状态 |

> 心跳：电脑端发 `ping { t }`（收音时 2 秒一次，空转时 10 秒一次），手机端回
> `pong { t }`。pong 由原生层直接回复，WebView 在后台被挂起也不影响。
> 手机回到前台时也会主动发 `ping { t }` 做一次健康检查；电脑端原样回 `pong`。
> 手机端在后台会用一条 `connectedDevice` 前台服务维持 TCP，不改变协议本身。

### 2.2.1 麦克风按钮的按键语义

麦克风按钮的「按下 / 松开」绑的是**磁铁**，触发方式取决于操作方式：

| 操作 | 时机 | 发什么 |
|---|---|---|
| **点按**（<220ms，开关常开收音） | 打开麦克风时 | `hotkey.execute`（按下 + 立即抬起）→ 预案的「点按打开」磁铁 |
| | 关闭麦克风时 | `hotkey.execute` → 预案的「点按关闭」磁铁 |
| **长按**（>220ms，瞬时说话） | 手指按下时 | `hotkey.down`（组合键保持按下）→ 「长按」绑定的磁铁，或磁片组的第一步 |
| | 手指抬起时 | `hotkey.up`（松开组合键）；如果绑的是磁片组，等待 `intervalSeconds` 后再依次 `hotkey.execute` 剩下的步骤（步骤之间同样间隔） |

三个绑定**互相独立**：预案里分别存 `micPressId` / `micReleaseId` / `micHoldId`。

「长按」还可以改绑一个**磁片组**（`micHoldGroupId`，与 `micHoldId` 二选一）：
组里第一个**有组合键**的步骤当作长按键按住，松手后释放，先等一个组间隔，
再把剩下的步骤依次执行。文本磁片没有键可以按住，排在按住步骤之前的文本
在按下时粘贴，排在后面的跟其它步骤一起在松手后执行。
点按的「打开 / 关闭」仍然只能绑单个磁片。

> 长按是「按住组合键说话、松手才结束」的语义 —— 例如按住时电脑端一直保持
> ⌘⇧V 按下状态，输入法会持续录音，松手才结束。点按则是两次独立的按键动作。

### 2.2.2 文本磁片

磁片除了「快捷键」还有一种：**文本磁片** —— 存一段提前编辑好的文字，
触发时让电脑把它粘贴到当前前台应用。

- 数据：`magnet.text`（非空即文本磁片，此时 `key` / `mouse` 一定是 null）
- 触发：发 `text.paste`，电脑端把文字写入剪贴板，激活目标应用，发送 ⌘V，
  约 1 秒后把用户原来的剪贴板还原（只有剪贴板仍是这段文字时才还原，
  避免覆盖用户中途自己复制的内容）。
- 多行文本原生支持，不需要特殊处理换行。

> **为什么是剪贴板 + ⌘V，而不是 Unicode 注入**：`CGEvent.keyboardSetUnicodeString`
> 只对标准 AppKit 输入框有效；Flutter、Electron、远程桌面和游戏会直接丢掉这段
> Unicode，表现为「什么都没发生」。⌘V 是所有应用都认的标准路径。
> 代价是短暂占用剪贴板，所以粘完要还原。

文本磁片在各处的行为：

| 位置 | 行为 |
|---|---|
| 磁贴点按 | 立刻粘贴这段文字 |
| 磁贴长按 | 同点按（没有键可以「按住」） |
| 麦克风「点按打开 / 关闭」 | 粘贴这段文字 |
| 麦克风「长按」 | 按下时粘贴（没有按住语义） |
| 磁片组里的一步 | 到那一步时粘贴 |

### 2.3 快捷键 combo 编码

与原型 `src/lib/hotkey.ts` 的 `magnetCombo()` **完全一致**，直接复用：

- 修饰键：`cmd` `shift` `ctrl` `alt`
- 键盘主键：`a`–`z` `0`–`9` `space` `enter` `tab` `escape` `backspace` `delete` `home` `end` `pageup` `pagedown` `up` `down` `left` `right`，其余符号用字符本身（`,` `.` `/` `;` `'` `[` `]` `-` `=` `` ` `` `\`）
- 鼠标键：`mouse1` `mouse2` `mouse3` `wheelup` `wheeldown`（与键盘主键**互斥**）

---

## 3. 音频通道（UDP + Opus）

- 编码：**AAC-LC**，48kHz，单声道，一帧 1024 采样（约 21.3ms）。
- 目标码率 32kbps（语音）；用户可在手机端调 16/24/32/48kbps。
- 载荷是**原始 AAC 访问单元**（不带 ADTS 头），macOS 端用 `AudioConverter` 直接解。

> **为什么是 AAC-LC 而不是 Opus**：Opus 语音质量更好、延迟更低，但 macOS 的
> `AudioConverter` **不支持 Opus 解码**（`AudioFormatGetProperty('opus')` 返回 -50），
> 用 Opus 就必须把 libopus 源码打包进 App。AAC-LC 两端都原生支持
> （安卓 `MediaCodec` 编码 / macOS `AudioConverter` 解码），零外部依赖。
> 后续要做更低延迟，可以换成自带的 libopus —— 协议里已经预留了 codec 字段。
- 传输：每帧 UDP 包，载荷 = 4 字节头 + Opus 帧。

```
 0        1        2        3        4        5        6
 +--------+--------+--------+--------+--------+--------+--------+
 |     seq (u16 BE)      |      ts (u32 BE, 微秒)      | Opus  |
 +--------+--------+--------+--------+--------+--------+--------+
```

包头固定 **6 字节**。

- `seq`：递增序号，丢包检测（接收端统计丢包率）
- `ts`：发送时的时间戳（微秒），接收端算单向延迟
- 接收端维护**抖动缓冲**（默认 60ms，可在电脑端详细设置里调），缓冲欠载即产生 underrun 计数

**为什么 UDP**：音频丢一包不该阻塞控制通道；丢包由抖动缓冲吸收，Opus 本身有丢包隐藏。

---

## 4. 音频从手机到「电脑麦克风」的最后一环

v1 方案：**写入 BlackHole**。

```
手机麦克风 → AudioRecord → MediaCodec(Opus) → UDP → 电脑解码(PCM)
          → CoreAudio 写入 BlackHole 2ch 的输入侧 → 系统把它当成一个麦克风
```

用户在 macOS「系统设置 → 声音 → 输入」里把 **BlackHole 2ch** 选为输入设备，任何录音 App
（微信语音、Zoom、备忘录）录到的就是手机麦克风的声音。

- 电脑端面板的「音频输出设备」下拉列出系统里的虚拟设备（BlackHole 2ch / 16ch 等），
  原型里已经有这个下拉。
- v1 提供一个「安装 BlackHole」的引导链接 / 一键说明，AirMic 不自己分发驱动。
- 自研 AudioDriverKit 驱动（AirMic Input）留到 v2 —— 需要 Apple 的
  `com.apple.developer.driverkit` entitlement 与签名分发，周期不可控。

---

## 5. 权限矩阵

| 能力 | 电脑端 | 手机端 |
|---|---|---|
| 麦克风 | — | `RECORD_AUDIO` |
| 后台收音 | — | 前台服务 + `FOREGROUND_SERVICE_MICROPHONE` |
| Wi-Fi 组播 | — | `ACCESS_WIFI_STATE` `CHANGE_WIFI_MULTICAST_STATE`（MulticastLock） |
| 邻近设备 | — | Android 13+ `NEARBY_WIFI_DEVICES` |
| 模拟按键 | **辅助功能权限**（CGEvent 必需） | — |
| 读写配对信息 | Keychain | 本地存储 |

---

## 6. 版本与兼容

协议头 `protocolVersion: 1`。版本不符 → 电脑端回 `hello.reject`，
message 写「电脑端版本较新，请更新电脑端 AirMic」这类**说人话**的错误。
