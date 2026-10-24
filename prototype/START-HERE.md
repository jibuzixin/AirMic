# 接手 AirMic 原型开发

> **v0.6 更新（2026-10-24）：可交互原型已完成。**
> 电脑端面板、手机端三屏、预案系统 UI、磁铁系统、演示页全部做完并通过截图验证。
>
> ⚠️ **如果你的任务是「把原型变成真正能用的软件」，先读 `开发须知.md`** ——
> 那里面有架构结论、哪些是假数据要换掉、7 个阶段的开发计划、19 条硬约束。
> 本文只讲**原型本身**怎么跑、怎么改。

## 你要先读的三份文件（按顺序）

1. **`HANDOFF.md`** — 当前进度、这轮修掉的 3 个 bug、已定决策、别踩的坑、还没做的
2. **`需求说明书.md`** — 产品逻辑（尤其 §4 预案系统）
3. **`DESIGN.md`** — 设计契约，**写任何 UI 代码前必读**

## 项目是什么

AirMic = 把手机麦克风变成电脑麦克风 + 把手机变成电脑遥控器。
电脑端是菜单栏应用（不占 Dock），手机端是主控界面。
当前阶段：**可交互原型**（浏览器里能点、能演示完整交互链路），不是实现音频内核。

## 技术栈（已定，不要换）

```
React 19 + TypeScript + Vite
Tailwind CSS v4 (CSS-first, @theme 块)
Framer Motion (spring 物理动效)
lucide-react (图标)
EasyUI 组件 (easyui.site，MIT，8 个已装在 src/components/ui/)
```

**最终产品形态**：Tauri 2 包装成 macOS `.app` + Android `.apk`。
**但现在只做 Web 原型**，浏览器直接看。

## 立刻要做的第一件事

```bash
cd airmic/airmic          # 仓库里套了一层同名目录
nvm use 24                # npm 10.8.2 有 bug，用 Node 24
npm install
npm run dev
```

EasyUI 组件**已经装好了**，不用再拉（拉法见 `HANDOFF.md` §4 —— GitHub API 会限流，要走 raw.githubusercontent）。

## 工作方式

- **先读 DESIGN.md 再写代码。** 违反设计契约的输出视为 bug，不是风格偏好。
- **不要另装风格 skill。** EasyUI 已定调性（深色单色 + 物理动效），跟 DESIGN.md 兼容。多个 skill 会打架。
- **不造假数据。** 没有真实数据就留空或写 `[--]`。禁止 `99.99%` 这类假精度指标。
- **动效只用 spring**，不用 `ease-in-out`；只动 `transform` 和 `opacity`；时长 ≤ 500ms。
- **手机端麦克风页完全不滚动**，一屏放下。设备页/设置页才可滚。
- 改完用 `node scripts/screenshots.mjs` 截图验证（需先起 `npx vite preview --port 4173`）。

## 动效规范（写任何动画前先看这条）

**动效 token 全项目只有一处**：`src/lib/motion.ts`。组件里不要手写 stiffness / damping。

两条硬规则（都是踩过坑换来的）：

1. **高度变化用 `src/components/Collapse.tsx`**，不要用 framer-motion 的 `layout`。
   `layout` 靠 scale 校正尺寸，会把中间的文字**压扁**。
   下方内容靠文档流跟随，兄弟节点不要再加 `layout`；列表重排用 `layout="position"`。
2. **透明度只用 `fadeFast`**，不要用慢 spring 驱动 opacity。
   spring 驱动透明度尾巴长达 600ms+，内容会「半透明地飘进来」。

量一下：`node scripts/animation-check.mjs`（当前 opacity 从未低于 0.95）。

## 核心交互（别搞错）

**麦克风按钮双语义**：
- 点击（<220ms）= 常开收音，再点关闭
- 长按（>220ms）= 瞬时说话，松开即停
- 已实现于 `src/components/MicButton.tsx`

**预案自动切换**：
电脑端前台应用变化 → 若该应用绑定了预案就切过去，否则切默认预案 → 手机端顶部**常驻**显示当前预案（不用弹窗，切换时闪一下琥珀点）。

**配对**：
已配对设备点一下**直接连上**，不请求同意；只有未配对设备才走配对请求。
电脑端「已配对设备」里可以删除配对信息，删了手机端必须重新配对。

**「麦克风按钮的按下/松开绑定」和「独立快捷键磁贴」是两件事**：
- 麦克风按钮的按下/松开绑定 → 麦克风页电平表下方的「按下 / 松开」芯片（可点，直接进设置）
- 独立快捷键磁贴 → 底部 3×2 磁贴区
原型的价值就在这层区分能不能讲清楚。

## 交付状态

7 步演示脚本（见 `需求说明书.md` §5）+ 本轮新增的三条流程已全部跑通并截图验证，
截图在 `docs/screenshots/`（17 张）。

**唯一没做的是音频内核**：虚拟音频输入设备最终必须 Swift/ObjC/C++ 写，Web 和 Tauri 都做不了。
UI 层 React + Tauri 没问题，音频层单独走 Swift。
