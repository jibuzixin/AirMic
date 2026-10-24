# EasyUI 组件库实测详情

> 实测日期：2026-10-24
> 用户自己在网上看到 `easyui.site` 并主动要求使用。以下数据全部来自实际抓取，非转述。

---

## 一、基本信息（实测确认）

| 项 | 值 | 验证方式 |
|---|---|---|
| 官网 | https://easyui.site | Playwright 实访 |
| 组件数 | **131** | `curl https://easyui.site/registry.json` → `items` 长度 |
| 官方描述 | "Production-ready animated UI components built with React, Tailwind CSS, and Framer Motion" | meta description |
| 副标题 | "Open-source, thoughtful components for modern React interfaces" | 页脚 |
| 作者 | Suraj（@surajmaurya_m） | 页面 |
| GitHub | https://github.com/Surajmaurya1/easyui | API 确认 |
| 授权 | **MIT** | GitHub API `license.spdx_id` |
| Stars / Forks | 164 / 9 | GitHub API（2026-10-24） |
| 最近推送 | **2026-10-23**（活跃） | GitHub API `pushed_at` |
| Open issues | 2 | GitHub API |
| Archived | false | GitHub API |
| 商业模式 | 站内有一个 "Pricing" 组件页（Free / Pro 两档），但**组件本身 MIT 开源** | 组件列表 + LICENSE |

---

## 二、依赖极干净（重要）

`registry.json` 全部 131 个组件的依赖统计：

```
framer-motion   118 个组件
lucide-react     66 个组件
```

**没有别的。** 没有 Radix、没有 dnd-kit、没有日期库、没有图表库。
这意味着装进来不会引入依赖地狱，shadcn 基础 + 这两个包就够。

安装时 CLI 会自动装 `framer-motion` / `lucide-react`，并把共享的 `lib/utils.ts`（`cn()`）和 `lib/motion-tokens.ts` 放好。

---

## 三、安装方式（官方文档实测）

### 标准流程
```bash
npx shadcn@latest init
npx shadcn@latest add Surajmaurya1/easyui/magnetic-button
```

### 组件落位
| registry 路径 | 项目路径 |
|---|---|
| `src/components/ui/DynamicIsland.tsx` | `components/ui/dynamic-island.tsx` |
| `src/lib/utils.ts` | `lib/utils.ts` |
| `src/lib/motion-tokens.ts` | `lib/motion-tokens.ts` |

### 通用 targets
- `registry:ui` → `components/ui/*.tsx`
- `registry:lib` → `lib/*.ts`

### 手动复制时需要的两个基础文件
`src/lib/utils.ts`（`cn()`）和 `src/lib/motion-tokens.ts`：

```ts
export const motionTransitions = {
  springSmooth: { type: 'spring', stiffness: 300, damping: 30 },
  springSnappy: { type: 'spring', stiffness: 400, damping: 25 },
  springBouncy: { type: 'spring', stiffness: 500, damping: 15 },
  springGentle: { type: 'spring', stiffness: 180, damping: 24 },
  easeOutCubic: { ease: [0.33, 1, 0.68, 1], duration: 0.25 },
} as const;
```

⚠️ **注意**：EasyUI 的 `springSmooth(300/30)`、`springSnappy(400/25)`、`springBouncy(500/15)`、`springGentle(180/24)` 与我们在 `DESIGN.md` §6.1 定的刻度**完全一致**。这是巧合但很省事 —— 直接复用它的 motion-tokens，不用自己维护第二套。

### 用法示例（官方）
```tsx
import { MagneticButton } from '@/components/ui/magnetic-button'
import { SpotlightCard } from '@/components/ui/spotlight-card'
import { ArrowRight } from 'lucide-react'
```

---

## 四、沙箱拉取失败的原因（本地应该没问题）

我实测了四种路径，都失败：

| 尝试 | 结果 |
|---|---|
| `npx shadcn@latest add Surajmaurya1/easyui/dynamic-island` | 进程挂起不落文件（9 个 shadcn 进程残留） |
| `curl https://easyui.site/api/skills` | **HTTP 429** + Vercel Security Checkpoint 页 |
| `curl https://easyui.site/registry/dynamic-island.json` | 404（路径不对） |
| `curl https://easyui.site/r/dynamic-island` | 404（shadcn 标准路径，但此站未暴露） |
| `curl raw.githubusercontent.com/.../DynamicIsland.tsx` | 连接失败（网络受限） |

Playwright 实访确认：页面上确实写着 `npx shadcn@latest add Surajmaurya1/easyui/dynamic-island`，
说明 CLI 路径是官方的，只是沙箱出网受限 + CLI 交互阻塞。

**本地直接跑应该就通。** 若仍失败，见 `HANDOFF.md` §5 的备选方案。

---

## 五、对 AirMic 最有用的组件（从 131 个里挑的）

### 电脑端（菜单栏面板）

| 组件 | 为什么 |
|---|---|
| **Dynamic Island** | macOS 灵动岛物理形变。AirMic 菜单栏面板在"紧凑图标 ↔ 展开面板"之间的过渡可以完全复用这个交互模型 |
| **Metric HUD** | 硬件加速 SVG sparkline + 指针拖拽查值 + 区间 spring 形变 + delta 指示。**Mac 端丢包/抖动/欠载/延迟统计几乎直接可用** |
| **Animated Number** | 数字逐列滚动形变（Apple 级）。电平数值、码率 |
| **Command Menu** | ⌘K 全局命令面板，⌘B 切换。菜单栏面板空间小，快捷键是刚需 |
| **Sidebar** | 折叠式侧栏，带游标跟随 hover pill + active pill 滑动。Mac 端如果需要设置分区可以用 |
| **Settle Modal** | 面板 scale 0.94→1.02→1.0 的 settle，不是廉价 fade。设置弹窗 |
| **Drag to Confirm** | 拖拽确认。**解绑设备 / 重置配置** 这类危险操作用它 |
| **Notification Bell** | 徽章数字滚动 + 到达抖动 + 下拉面板。**手机端发来配对请求时电脑端弹这个** |

### 手机端

| 组件 | 为什么 |
|---|---|
| **Sheet** | 四向可拖拽抽屉，拖拽甩出关闭，spring 回弹。手机端设置/预案编辑的容器 |
| **Pull to Refresh** | 弹性阻尼曲线 + 曲线图可视化。**手机端手动刷新扫描**（用户明确要求手动刷新） |
| **Animated Tabs** | 物理 pill 指示器滑动 + 内容交叉淡入。设备页/预案页切换 |
| **Spring Select** | 下拉菜单跟随触发器 spring，chevron 微过 180°。选输出设备、选绑定应用 |
| **OTP Input** | 自动前进的数字格 + spring 弹出。**输入电脑端 6 位配对码** |
| **Pill Navigation** | 分段导航 + 共享 pill 形变 + 嵌套子菜单。底部导航 |
| **Morphing Button** | Idle→Loading→Success→Error 无跳动状态切换。**配对请求被拒绝/同意** |
| **Liquid Toggle** | 液体形变 toggle。设置项开关 |
| **Stretch Switch** | 拇指拉伸 + snap。另一个 toggle 备选 |
| **Focus Mode** | 聚光其他内容变暗 + 零布局位移。**展示"当前生效预案"**很合适 |
| **Product Tour** | 聚光灯引导 + 自动滚动 + 底部 sheet 停靠。**原型演示自带解说** |
| **Loader** | 4 种平静不焦虑的动效变体。扫描中 / 连接中 |
| **Skeleton** | 微光扫过 + SkeletonReveal 真实内容浮现。列表加载 |

### 可选氛围组件（如果想给原型加"演示感"）
| 组件 | 说明 |
|---|---|
| Morphing Blob | SVG blob 背景持续形变 + 跟随光标 |
| Spotlight Card | 暗色卡片，鼠标位置驱动边框与内表面照明 |
| Magnetic Button | 靠近光标磁吸 |
| Dot Shader / Dot Field | GPU 点阵背景 + 磁吸排斥 |
| Text Scramble Decoder | 乱码逐字解出。**状态切换文案可用** |

---

## 六、组件清单（全部 131 个，按 registry 顺序）

<details>
<summary>展开查看</summary>

Activity Feed, Activity Heatmap, Advanced Data Table, AI Agent Activity, AI Response, Airport Matrix Clock, Alert, Animated File Upload, Animated Number Morph, Animated Tabs, Avatar Stack, Badge, Bar Chart, Batch Gesture Tray, Book Call Button, Branching Submenu, Breadcrumb, Button, Calendar, Car Smoke Page Transition, Chat, Circular Orbit, Code Snippet Deck, Combobox, Command Menu, Cursor Follower, Date Picker, Density Lens, Dependency Trace, Depth Corridor, Directional Tooltip, Donut Chart, Dot Field, Dot Shader, Drag to Confirm, Draw Checkbox, Dynamic Island, Evil Eye, Expandable Data Row, Expandable Search, FAQ, Floating Action Dock, Focus Mode, Form, Funnel Chart, Glass Navbar, Glitch Text, Glyph Matrix, Gooey Menu, Gravity Particle Burst, Hamburger Menu, Interactive Area Chart, Interactive Timeline, Intro Loader, iOS-style Search Bar, Liquid Ripple Button, Liquid Toggle, Live Line Chart, Loader, Lock Input, Login, macOS Folder Cards, Magnetic Button, Meteors, Metric HUD, Money Card, Morphing Blob, Morphing Button, Morphing Dialog, Morphing Icon, Morphing Mega Menu, Morphing Shape Loader, Neon Edge Button, Nimbu Mirchi, Not Found, Notification Bell, Notification Stack, Orbital Loading Ring, Origin Dropdown, OTP Input, Package Box, Particle Delete, Payment Receipt Printer, Payment Status, Peek Card, Photo Box, Pill Navigation, Press Button, Pricing, Product Tour, Profile Card, Pull to Refresh, Rainbow Button, Recovery Ledger, Reveal Card, Rocket Party Popper, Scroll Progress Navigation, Scroll Velocity Text, Selection Basket, Settle Modal, Sheet, Shooting Stars, Sidebar, Sign Up, Skeleton, Slide Pagination, Small Floating Dock, Smart Comparison, Smooth Accordion, Sparkles Core, Speed Warp, Split Button, Spotlight Card, Spotlight Search, Spring Select, Stack Unfold Panel, Stacked Cards, Stat Card, Stepper, Sticky Pages, Story Cards, Stretch Switch, Text Scramble Decoder, Thinking Orb, Torque Dial, Typewriter Button, Undo Toast, Unfold Accordion, Velocity Toast, Wallet Balance, Wallet Card

</details>

---

## 七、风格判断

EasyUI 的视觉语言是 **monochrome 深色 + 单一强调色 + 物理动效**，
这跟 AirMic 已定的设计决策（深色 + 琥珀 #FFB020）**天然兼容**。

EasyUI 自己的文档提到 "monochrome color system" 和 "elevation surfaces"（见 registry-architecture 文档），
说明它的 token 体系就是单色的 —— 换成琥珀强调色是改一个变量的事，不是重做。

所以：**EasyUI 负责"结构 + 动效"，AirMic 的 DESIGN.md 负责"颜色 + 语气 + 规则"。** 两者不冲突。
