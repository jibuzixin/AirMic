# AirMic 原型 —— 交接文档

> 写给下一个接手的人（人或 agent）。
> 这份文档 + `DESIGN.md` + `src/` 下的代码，就是全部上下文。
> 日期：2026-10-24（v0.5）

---

## 0. 一句话背景

AirMic = 把手机麦克风变成电脑麦克风 + 把手机变成电脑遥控器。
电脑端是**状态栏应用**（不占 Dock），手机端是**主控界面**。
当前阶段：**可交互原型已完成**，浏览器里能演示完整交互链路。

---

## 1. 当前进度

| 项 | 状态 |
|---|---|
| 技术选型 | ✅ React 19 + TS + Tailwind v4 + Framer Motion 14 + lucide-react |
| 设计契约 `DESIGN.md` | ✅ 12 章节（含动效实现细则，见 §6） |
| 需求文档 `需求说明书.md` | ✅ v0.4 |
| 共享状态层 `src/lib/airmic-store.tsx` | ✅ 两端 UI 的唯一真相源 |
| 动效 token `src/lib/motion.ts` | ✅ 全项目唯一的动效基线 |
| 折叠容器 `src/components/Collapse.tsx` | ✅ 高度动画的统一做法 |
| EasyUI 组件 | ✅ 8 个已安装 |
| 电脑端菜单栏面板 | ✅ `src/components/mac/` |
| 手机端三屏（设备 / 麦克风 / 预案） | ✅ `src/components/phone/` |
| 预案系统 UI + 自动切换 | ✅ 常驻预案条 + 预案编辑抽屉 |
| **快捷键磁铁系统** | ✅ 图标 + 名字 + 按键组合，全局可复用 |
| 快捷键设置 | ✅ 麦克风按钮绑定 + 独立磁贴，两个入口 |
| 键盘 + 鼠标快捷键录制 | ✅ `HotkeyRecorder`，逐个点出组合键 |
| 电脑端未收音时的手机震动提醒 | ✅ |
| 演示页（Mac + 手机 + 控制台） | ✅ `src/App.tsx` |
| 截图验证脚本 | ✅ `scripts/screenshots.mjs`（24 张） |
| 动画量化脚本 | ✅ `scripts/animation-check.mjs`（透明度收敛）+ `scripts/collapse-check.mjs`（收起残留与时长） |
| 交互断言脚本 | ✅ `scripts/fix-check.mjs`（主键可选 / 抽屉滑入 / 点空白退出 / 配对码刷新） |
| **音频内核** | ❌ **必须 Swift/ObjC/C++**，Web/Tauri 做不了（见 §9） |

---

## 2. 怎么跑起来

```bash
cd airmic/airmic          # 注意：仓库里套了一层同名目录
nvm use 24                # npm 10.8.2 有 arborist bug，用 Node 24 + npm 11
npm install
npm run dev               # 开发
npm run build             # 构建（tsc -b && vite build）
```

截图验证：

```bash
npx vite preview --port 4173 &
node scripts/screenshots.mjs      # 24 张 → /tmp/airmic-shots
node scripts/animation-check.mjs  # 量动画的透明度收敛时间
node scripts/collapse-check.mjs   # 量收起的残留 / 时长 / 收尾跳变
node scripts/fix-check.mjs        # 断言交互真的能用（主键、抽屉、配对码）
```

**Playwright 已装在项目 devDependencies**，Chromium 用 `npx playwright install chromium` 装。

---

## 3. 代码地图

```
src/
  App.tsx                    演示页：左 Mac 面板 / 中 控制台 / 右 手机
  index.css                  设计 token 全套（@theme 块）
  lib/
    hotkey.ts                🆕 磁铁类型 + 组合键格式化（显示串 / 下发串）
    airmic-data.ts           类型定义 + 模拟数据（4 预案 / 17 磁铁 / 6 设备 / 6 前台应用）
    airmic-store.tsx         共享状态层 ★ 两端 UI 都从这里取状态
    motion.ts                动效 token 全项目唯一基线 ★
    motion-tokens.ts         EasyUI 自己的动效 token（仅 EasyUI 组件内部用）
    utils.ts                 cn / copyToClipboard / scrollToTop
  components/
    Collapse.tsx             高度折叠的统一做法 ★
    phone/
      HotkeyRecorder.tsx     🆕 键盘 + 鼠标菜单（逐个点出组合键）
      MagnetEditor.tsx       🆕 磁铁编辑（选图标 / 起名 / 录制）
      MagnetPicker.tsx       🆕 选一个已有磁铁
      MagnetIconPicker.tsx   🆕 图标库
      PhoneOverlay.tsx       🆕 手机框级 portal 容器（二级弹层要用）
    LevelRing.tsx            48 柱径向电平表
    MicButton.tsx            麦克风双语义按钮（220ms 阈值）
    mac/                     MacPanel / PairingRequestCard / OutputDevicePicker /
                             AdvancedSettings / PairedDevices / mac-motion
    phone/                   PhoneShell / DevicePage / MicPage / PresetPage /
                             PresetEditor / TileGrid / icons
    ui/                      EasyUI 组件（8 个，见 §4）
```

**两端 UI 靠 `useAirmic()` 共享状态**，没有真实 IPC。

---

## 4. EasyUI 组件（已装，MIT）

`src/components/ui/` 下 8 个，全部来自 `easyui.site` registry：

| 组件 | 用在哪 |
|---|---|
| `animated-number` | 电脑端抖动缓冲数值滚动 ✅ |
| `drag-to-confirm` | 手机端「解绑设备」 ✅ |
| `sheet` | 备用 —— 手机端预案编辑自己实现了抽屉（§7.3） |
| `dynamic-island` | 备用 —— 社交资料卡形态，跟 318px 菜单栏不搭 |
| `metric-hud` | 备用 —— 需要 timeSeries 数据，原型没有真实数据 |
| `notification-bell` | 备用 —— 下拉通知形态不适合 318px 面板 |
| `pull-to-refresh` | 备用 —— 它带金融统计卡，耦合太深 |
| `command-menu` | 备用 —— 它是 EasyUI 自己的组件浏览器目录 |

### 拉取方式（重要）

GitHub API 会限流，**shadcn CLI 的 `Surajmaurya1/easyui/xxx` 走 GitHub 解析，
限流后会失败**。可用路线：

```bash
curl -s https://easyui.site/registry.json -o /tmp/reg.json
# 每个 item.files[].path 拼 https://raw.githubusercontent.com/Surajmaurya1/easyui/main/<path>
```

`src/lib/utils.ts` 跟 EasyUI 版本完全一致，无需覆盖。

### ⚠️ motion-tokens 跟 DESIGN.md 对不上

EasyUI 仓库里 `src/lib/motion-tokens.ts` 的真实值（200/28、380/30、170/26）
**不等于** easyui.site 文档页贴的旧值（300/30、400/25、500/15、180/24）——
文档没跟上仓库，也更不等于 DESIGN.md。

**结论**：AirMic 自己的 UI 一律用 `@/lib/motion`；EasyUI 组件内部用它们自己的 token，两套并存不冲突。

---

## 5. 这一轮修掉的 bug

### 5.1 电平表 36/48 根柱子被裁掉 —— SVG 缺 viewBox

`LevelRing.tsx` 的柱子坐标是 `-136..136`（以圆心为原点），
但 `<svg width={300} height={300}>` 没有 viewBox，视口是 `0..300`，
**只有右下象限的柱子能画出来**。

修法：两个 SVG 都加 `viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}`。

### 5.2 PTT 结束后红色波纹环卡在屏幕上不消失

`MicButton.tsx` 的波纹用了 `transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}`。
**AnimatePresence 的退出会沿用同一份 transition** —— 无限重复意味着退出动画永远跑不完。

同时违反 DESIGN §10（禁止 ease-in-out）和 §6.2（动画 ≤500ms）。

修法：改成一次性 spring 进场/退场。

> **教训**：`repeat: Infinity` 的动画不能放在 `AnimatePresence` 管理的元素上。

### 5.3 EasyUI 组件渲染成浅色

Tailwind v4 的 `dark:` 变体默认跟随系统，部分系统是浅色 →
`drag-to-confirm` 的轨道变成白条混在深色界面里。

修法（两处都要改）：

```css
/* src/index.css */
@custom-variant dark (&:where(.dark, .dark *));
```
```html
<!-- index.html -->
<html lang="zh-CN" class="dark">
```

### 5.4 预案编辑抽屉「点了没反应」

`PresetPage` 把点击那一刻的 preset **对象快照**存进 state 再当 prop 传给抽屉。
抽屉里改的是 store，显示的却是旧快照。

修法：父组件只存 **id**，每次渲染用 `presets.find(...)` 取**实时对象**。

> **教训**：任何「编辑弹层」都必须读实时数据，不能读快照。

### 5.5 动画发虚、展开时文字被压扁（用户反馈）

两个叠加的原因：

1. **用慢 spring 驱动 opacity** —— spring 驱动透明度时尾巴长达 600ms+，
   内容是「半透明地飘进来」。展开中途截图能明显看到字是虚的。
   修法：透明度一律用 `fadeFast`（700/45，~150ms 收敛）。
2. **用 framer-motion 的 `layout` 做高度动画** —— `layout` 的尺寸补间是用
   **scale** 做校正的，元素高度从 44 变成 240 就被 scaleY(5.5)，
   **中间的字跟着被压扁**。
   修法：用 `Collapse`（真实高度补间），兄弟节点不要再加 `layout`。

实测：`scripts/animation-check.mjs` 量到展开过程中 opacity 从未低于 0.95。

### 5.6 收起折叠区后留下 12px 空白（用户反馈"最后一下卡顿"）

`Collapse` 的 `className`（比如 `pb-3`）原来挂在**外层** motion.div 上。
外层高度归零了，但 padding 还占着 —— 面板上就留下一条空白带，
收起动画结束的瞬间内容"啪"地消失、留下一条空隙，就是那个"卡一下"。

修法：`className` 挪到**内层**，被外层的 `overflow:hidden` 一起裁掉。

实测（`scripts/collapse-check.mjs`）：收起完成后间距 1px（只剩边框），
收起耗时 284ms（DESIGN 限 480ms），收尾平滑减速到 0，无跳变。

### 5.7 麦克风按钮的图标语义反了（用户反馈）

原来：待机显示 `Mic`、激活显示 `MicOff` —— 图标在说"点了会开/会关"，
用户得翻译一次才知道现在是开着还是关着。

改成**状态语义**：待机 `MicOff`（麦克风是关的）、收音中 `Mic`（麦克风开着）。
颜色另外承担状态语义（琥珀=常开、红=瞬时）。

### 5.8 磁铁的主键点了没反应（用户反馈）—— React 的 `key` 是保留属性

`MagnetEditor` 里写的是：

```jsx
<HotkeyRecorder modifiers={rec.modifiers} key={rec.key} mouse={rec.mouse} ... />
```

`key` 是 **React 的保留属性**：它只用来标识 element 的身份，**不会作为 props
传给子组件**。于是：

- `HotkeyRecorder` 收到的 `props.key` 永远是 `undefined`
  → 主键按钮永远不高亮，预览里永远只有修饰键
- 每改一次主键，React 认为 element 换了身份 → 整个 `HotkeyRecorder` 被卸载重建

表现就是「点了主键完全没反应」—— 状态其实存进了 store，但 UI 永远拿不到那个值。

修法：属性改名成 **`mainKey`**（`HotkeyRecorder` / `recorderState` 一起改），
并在两处都写了注释说明为什么不能叫 `key`。

> 这类 bug 很隐蔽：TypeScript 不会报错（`key` 是合法的 JSX 属性），
> 状态也是对的，只有界面不反映。只能靠实测断言抓。

### 5.9 预案编辑抽屉没有弹出动画、点空白退不出去（用户反馈）

`PresetEditor` 之前是直接渲染的一个 `div`，既没有遮罩也没有动画 ——
跟磁铁选择器 / 磁铁编辑器的交互对不上。

修法（见 `DESIGN.md` §7.3 弹层规范）：加一层 `motion` 遮罩 + 抽屉本体改成
`motion.div`（`y: '100%' → 0`，`springSmooth`），点遮罩关闭。
遮罩和抽屉都在同一个 `AnimatePresence` 下，退场动画才接得住。

实测（`scripts/fix-check.mjs`）：抽屉顶边从 817px 滑到 225px（594px 行程），
点空白处抽屉退出。

### 5.10 配对码旁边的「复制」应该是「刷新」（用户反馈）

配对码是**临时的**，复制没有意义 —— 用户要的是换一个。

- `pairCode` 从模块常量变成 store 的状态（`airmic-store.tsx`）
- 新增 `refreshPairCode()`：换一个 6 位新码，**旧码立即失效**
- `pairByCode` 改成校验当前码，旧码会得到「配对码已过期，在电脑端重新生成一个」
- `MacPanel` 的 `PairCodeRow`：复制按钮 → 刷新按钮（`RefreshCw`），
  换码时数字淡入、图标转一圈

---

## 6. 动效规范（**正式版也要照这个写**）

### 6.1 token 只有一个地方

`src/lib/motion.ts`：

| Token | 参数 | 用途 |
|---|---|---|
| `springSmooth` | 300 / 30 | 通用、面板展开 |
| `springSnappy` | 400 / 25 | 按钮点击、磁贴按下 |
| `springBouncy` | 500 / 15 | 麦克风按钮按下回弹 |
| `springGentle` | 180 / 24 | 大范围位移、抽屉滑入 |
| `fadeFast` | 700 / 45 | **透明度专用** |
| `layoutSpring` | 420 / 38 | **高度 / 折叠专用** |

组件里**不要手写** stiffness / damping。

### 6.2 两条硬规则

1. **高度变化用 `src/components/Collapse.tsx`**，不要用 `layout`。
   `layout` 靠 scale 校正尺寸，会把中间的文字压扁。
   下方内容靠正常文档流跟着走，**兄弟节点不要加 `layout`**。
2. **透明度只用 `fadeFast`**，不要用慢 spring 驱动 opacity（尾巴 600ms+，内容会发虚）。
   列表项重排用 `layout="position"`（只补间位置，不做尺寸缩放）。

### 6.3 其它

- 只动 `transform` / `opacity`；时长 ≤ 500ms；禁 `ease-in-out`。
- 悬停不发声。
- 页面隐藏时暂停动画（`visibilitychange`）—— **还没实现**。

---

## 7. 本轮新增的功能

### 7.1 已配对设备点一下直接连上

- store 新增 `knownDevices`（电脑端记住的设备）、`connectTo(id)`、`unpairDevice(id)`。
- 手机端设备列表：**在 `knownDevices` 里**的 → 点一下直连；**不在**的 → 发配对请求。
- 列表项副标题直接写明差别：「点一下直接连接」/「点一下请求配对」。
- 电脑端新增「已配对设备」折叠区，每台可删除配对信息（两段式确认）。
  删掉后手机端再点它必须重新配对。
- 配对码校验通过也会写进 `knownDevices`（跟路径 A 的行为一致）。

### 7.2 手机端常驻显示当前预案

- 顶部第二行常驻「● 当前预案 聊天预案 · 微信」，**不自动消失**。
- 切换时琥珀点闪一下做强调，2 秒后退回中性色。
- 回落默认预案时也常驻显示（那是"当前在用哪套"，不是报错）。

### 7.3 快捷键设置能真的用

- 麦克风页电平表下方的「按下 / 松开」芯片**可点**，直接打开当前预案的麦克风绑定设置。
- 预案页点某套预案 → 打开编辑抽屉。
- 抽屉分两个独立区块（需求 §4.1 的核心）：
  - **麦克风按钮**：按下时 / 松开时各绑一个快捷键，8 个候选键芯片，点一下绑上、再点取消。
  - **独立快捷键磁贴**：点磁贴的键位芯片就地展开候选键；可增删磁贴（0–6 个）。
- 两处都**当场生效**，不等保存。
- 抽屉由 `PhoneShell` 统一挂载（不在 `PresetPage` 里），这样麦克风页也能打开它。

---

## 8. 快捷键磁铁模型（v0.6 引入，结构性改动）

**磁铁（Hotkey Magnet）= 图标 + 名字 + 一组按键，是全局可复用的。**

```
HotkeyMagnet {
  id, label, icon,
  modifiers: ModifierKey[],   // cmd / shift / ctrl / alt
  key: string | null,          // 键盘主键
  mouse: MouseKey | null,      // 鼠标键（与 key 互斥）
}
```

- 显示串（`⌘⇧V`）和下发串（`['cmd','shift','v']`）都是**算出来的**
  （`magnetKeys()` / `magnetCombo()`），不存字段，避免两处不一致。
- 预案的 `tiles` 变成 `{ id, magnetId }`；`Preset` 的 `micPress` / `micRelease`
  变成 `micPressId` / `micReleaseId`。
- 磁铁库在 store 里（`magnets` + `addMagnet` / `updateMagnet` / `deleteMagnet`）。
  删磁铁会自动清掉所有预案里的引用。
- **磁铁没配任何键 = 暗态**（磁贴显示「未设置」，点击提示去配置）。

**创建磁铁的三步**：选图标 → 起名字 → 用 `HotkeyRecorder`（键盘 + 鼠标菜单）
依次点出组合键。不做"手打组合键"那种交互。

⚠️ **`HotkeyRecorder` 的主键属性叫 `mainKey`，不能叫 `key`** —— `key` 是 React
的保留属性，不会传进 props，还会触发组件卸载重建。详见 §5.8。

**麦克风按钮的按下/松开选的是磁铁**，不是直接选按键 —— 这样同一个「语音输入」
磁铁既能当磁贴用，也能绑给麦克风按钮。

⚠️ **二级弹层必须用 `PhoneOverlay` 的 portal**：`MagnetPicker` / `MagnetEditor`
是在预案抽屉（一个 absolute 定位元素）里渲染的，直接写 `absolute inset-0`
只会盖住抽屉那一块。portal 容器在 `PhoneShell` 里，`pointer-events-none`，
**不要加 `aria-hidden`**（加了会把里面的按钮从无障碍树里剔除）。

---

## 9. 硬约束（**别踩的坑**）

### 架构层
1. **虚拟音频输入设备（BlackHole 那套）最终必须 Swift/ObjC/C++**。
   Web 和 Tauri 都做不了。UI 层 React + Tauri 没问题，音频内核单独走 Swift。
   最终架构：**UI 层 React/Tauri，音频层 Swift**。
   别误以为整条链路能用 Web 搞定。
2. 目标形态：Tauri 2 → macOS `.app` + Android `.apk`。

### 设计层
3. **电平表两个 SVG 都要 `pointer-events:none`** —— v0.2 踩过。
4. **AI 味 UI** → 见 `DESIGN.md` §10 禁止清单。假数据指标绝对不能出现。
5. **动效只用 spring**，只用 `@/lib/motion` 的 token，见 §6。
6. **长按 vs 点击阈值 220ms**，不要改。
7. **手机端麦克风页完全不滚动**，一屏放下；设备页/设置页才可滚。
8. **纯黑 #000000 禁止**，最深是 `#0B0B0D`。
9. **amber 是稀缺资源**，一个视图最多一处主操作。

### 产品层
10. **「麦克风按钮按下/松开绑定快捷键」和「独立快捷键磁贴」是两件事**。
    - 麦克风按钮的按下/松开绑定 → 麦克风页芯片 + 抽屉的「麦克风按钮」区
    - 独立快捷键磁贴 → 底部 3×2 磁贴区 + 抽屉的「独立快捷键磁贴」区
    **搞混了原型就没有意义了。**
11. **预案切换用顶部常驻条，不用弹窗** —— 弹窗会打断正在进行的说话动作。
12. **路由不可变**：未配对 → 永远设备页；已配对 → 直接麦克风页。
13. **手动刷新扫描**，不持续轮询（省电，用户明确要求）。
14. **已配对设备点一下直连**，不弹配对请求；只有未配对设备才走配对流程。
15. **电脑端停止收音时，手机端开始收音要震动 + 提示** ——
    「电脑端没有在收音，声音传不过去」。震动用 `navigator.vibrate`
    （iOS Safari 没有这个 API，必须做保护），视觉提示是主要反馈渠道。
    提示条不能打断正在进行的说话动作（`pointer-events-none`，不参与文档流）。
16. **`Collapse` 的 `className` 挂内层**，挂外层会留下 padding 空隙。
17. **不要用 `key` 当自定义 prop 传给子组件** —— 它是 React 保留属性，
    不会出现在 `props` 里，而且会触发组件卸载重建。快捷键主键叫 `mainKey`。
18. **手机端所有弹层用同一套交互**：从下往上滑出 + 半透明遮罩 + 点空白退出，
    见 `DESIGN.md` §7.3。少一样就跟其他弹层对不上。
19. **配对码旁是「刷新」不是「复制」**；刷新后旧码立刻失效。

---

## 10. 还没做的

| 项 | 说明 |
|---|---|
| 音频内核 | Swift，见 §9.1 |
| 真实配对协议 | 一次性码 + 长期 token 的字段设计 |
| 页面隐藏时暂停动画 | DESIGN §12 要求，未实现 |
| 静音自动恢复时长 | 原型用文案表达，未实现真实计时 |
| Mac 端 AppKit 还是 SwiftUI | `NSStatusItem`（推荐）vs `MenuBarExtra` |
| Android 版 | 原型按 iOS 尺寸画 |
| Tauri 打包 | 原型阶段没做 |

---

## 11. 参考资料

- `research/01-调研结论.md` — Figma MCP / 设计 skill / 跨端方案
- `research/02-EasyUI调研.md` — EasyUI 组件库实测详情
- `DESIGN.md` — 设计契约（**做 UI 前必读**）
- `src/lib/airmic-data.ts` — 数据模型
- `src/lib/airmic-store.tsx` — 共享状态层
- `src/lib/motion.ts` — 动效基线

外部：
- EasyUI https://easyui.site ｜ 组件目录 https://easyui.site/llms.txt ｜ registry https://easyui.site/registry.json
- EasyUI GitHub https://github.com/Surajmaurya1/easyui
- Tauri 2 https://tauri.app
