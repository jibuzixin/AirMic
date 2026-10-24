# AirMic

把手机麦克风变成电脑麦克风，同时把手机变成电脑遥控器。

- **电脑端**：macOS 菜单栏应用（不占 Dock），纯 Swift / SwiftUI
- **手机端**：Android App，Capacitor + React（复用原型 UI）+ Kotlin 原生插件

## 仓库结构

```
airmic/
├── mac/                 电脑端（SwiftPM 包）
│   ├── Sources/AirMicKit/   服务端内核：协议、配对、音频、快捷键
│   ├── Sources/AirMac/       菜单栏应用（SwiftUI）
│   └── Sources/airmicd/      命令行服务端（开发/排查用）
├── android/             手机端（Capacitor 工程根目录）
│   ├── src/                 React UI（复用 prototype/src/components/phone）
│   └── android/             原生安卓工程（Capacitor 生成）
│       └── app/src/main/java/com/airmic/phone/   原生插件（扫描/控制/采集）
├── prototype/           原型（**交互契约与视觉契约的真相源**，勿删）
├── shared/protocol.md   局域网协议
├── docs/技术方案.md     架构、决策、里程碑、风险
├── tools/fake-phone.mjs 假手机端（开发期验证协议）
└── scripts/             环境安装与脚本
```

## 快速开始

```bash
# 1. 装工具链（全部装进项目内 .toolchain/，不动系统环境）
./scripts/setup-env.sh
source scripts/env.sh

# 2. 电脑端
cd mac && swift build
.build/debug/airmicd serve --auto-approve   # 命令行服务端（开发用）

# 3. 手机端
cd ../android && npm install && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug         # 产出 app/build/outputs/apk/debug/
```

## 开发期工具

```bash
node tools/fake-phone.mjs --pair        # 模拟手机发起配对
node tools/fake-phone.mjs --code 123456 # 模拟输配对码
node tools/fake-phone.mjs --hotkey cmd+shift+v
```

## 文档

| 文件 | 内容 |
|---|---|
| [docs/技术方案.md](docs/技术方案.md) | 架构、关键决策、里程碑、风险 |
| [shared/protocol.md](shared/protocol.md) | 局域网协议（控制 / 音频 / 发现） |
| [prototype/需求说明书.md](prototype/需求说明书.md) | 产品逻辑 |
| [prototype/DESIGN.md](prototype/DESIGN.md) | 视觉契约 |
| [prototype/开发须知.md](prototype/开发须知.md) | 原型侧的踩坑记录与硬约束 |
