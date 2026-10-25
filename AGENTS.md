# AGENTS.md

本仓库的完整开发说明在 **`CLAUDE.md`**，请先读它。下面是最小必要信息：

- 项目：AirMic —— 手机当电脑麦克风 + 遥控器。macOS 菜单栏 App（Swift/SwiftUI/AppKit） + Android App（Capacitor + React + Java 插件）。
- 原型目录 `prototype/` 是交互与视觉的**真相源**，不要删、不要擅自改产品逻辑。
- 构建：
  - Mac：`cd mac && swift build`；打包 `./scripts/package-mac.sh`。
  - Android：`cd android && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`。
  - 工具链全在 `.toolchain/`，先 `source scripts/env.sh`；不要动用户全局环境。
- 协议：`shared/protocol.md`。数据模型：`CLAUDE.md` §5。
- 硬约束：不要用 ad-hoc 签名（会丢辅助功能授权）；不要改回 SwiftUI `MenuBarExtra`；不要恢复配对码；AAC 输出包大小参数是帧数不是字节。
- 提交前至少跑通 `swift build` 和 `npm run build`。
