import { chromium } from 'playwright'

/**
 * 本轮三个修复的实测脚本
 * ------------------------------------------------------------
 *   1. 磁铁主键单选点了要有反应（之前 key 属性被 React 吃掉，永远选不上）
 *   2. 配对码旁是「刷新」按钮，点一下配对码要换
 *   3. 预案编辑抽屉要从下往上弹出，点空白处要能退出
 *
 * 每项都断言实际 DOM 状态，不是截图肉眼看。
 */
const URL = process.env.AIRMIC_URL ?? 'http://localhost:4173/'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 2,
})
await page.goto(URL, { waitUntil: 'networkidle' })

let failed = 0
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ` —— ${extra}` : ''}`)
  if (!ok) failed++
}

/* ================================================================
 * 1. 磁铁主键单选
 * ================================================================ */
await page.getByRole('button', { name: '预案与设备设置' }).click()

// 先在页面里挂一个 rAF 采样器，再点开抽屉 —— 这样才采得到滑入过程
await page.evaluate(() => {
  window.__tops = []
  const tick = () => {
    const el = document.querySelector('div.rounded-t-2xl.border-t')
    if (el) window.__tops.push(Math.round(el.getBoundingClientRect().top))
    if (window.__tops.length < 60) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
await page.getByRole('button', { name: /聊天预案/ }).first().click()
await page.waitForTimeout(700)
const tops = await page.evaluate(() => window.__tops)

// 抽屉滑入：顶边应该从靠下（数值大）逐步上移到最终位置
const slidUp =
  tops.length > 6 && Math.max(...tops) - Math.min(...tops) > 20
check(
  slidUp,
  '预案抽屉从下往上弹出',
  `采样 ${tops.length} 帧，顶边 ${tops[0]} → ${tops[tops.length - 1]}（跨度 ${Math.max(...tops) - Math.min(...tops)}px）`,
)

/* --- 主键单选 --- */
await page.getByRole('button', { name: /磁铁库/ }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '新建磁铁' }).click()
await page.waitForTimeout(400)
await page.getByRole('textbox', { name: '磁铁名字' }).fill('静音麦克风')
await page.getByRole('button', { name: '⌘ Command' }).click()
await page.getByRole('button', { name: '⇧ Shift' }).click()

const mainKeyBtn = page.getByRole('button', { name: 'M', exact: true })
await mainKeyBtn.click()
await page.waitForTimeout(150)

const pressed = await mainKeyBtn.getAttribute('aria-pressed')
check(pressed === 'true', '主键 M 点得中（aria-pressed=true）', `实际 ${pressed}`)

// 预览条要显示组合键
const previewText = await page
  .locator('div')
  .filter({ hasText: /^组合键/ })
  .last()
  .innerText()
const hasKey = /⇧⌘M|⌘⇧M/.test(previewText)
check(hasKey, '组合键预览里出现了主键 M', `预览内容「${previewText.replace(/\s+/g, ' ')}」`)

// 再点一次 = 取消
await mainKeyBtn.click()
await page.waitForTimeout(150)
const pressed2 = await mainKeyBtn.getAttribute('aria-pressed')
check(pressed2 === 'false', '再点一次主键 = 取消选择', `实际 ${pressed2}`)

await page.getByRole('button', { name: 'M', exact: true }).click()
await page.waitForTimeout(120)
await page.getByRole('button', { name: '保存磁铁' }).click()
await page.waitForTimeout(400)

// 保存后磁铁列表里要显示组合键（而不是「未设置」）
const magnetRowText = await page
  .locator('li')
  .filter({ hasText: '静音麦克风' })
  .last()
  .innerText()
check(/⇧⌘M|⌘⇧M/.test(magnetRowText), '保存后磁铁列表显示完整组合键', `列表行「${magnetRowText.replace(/\s+/g, ' ')}」`)

/* ================================================================
 * 3. 点空白处退出抽屉
 * ================================================================ */
// 抽屉遮罩是本组件独有的一层（内联背景色 rgba(11, 11, 13, 0.55)）
const backdrop = page.locator('div[style*="rgba(11, 11, 13, 0.55)"]')
check((await backdrop.count()) > 0, '抽屉有可点击的遮罩层')
await backdrop.first().click({ position: { x: 40, y: 40 } })
await page.waitForTimeout(700)
const drawerGone = (await page.getByRole('heading', { name: '编辑预案' }).count()) === 0
check(drawerGone, '点空白处抽屉退出了')

/* ================================================================
 * 2. 配对码刷新
 * ================================================================ */
const consoleCol = page.locator('section', { hasText: '演示控制台' }).first()
await consoleCol.getByRole('button', { name: '断开连接' }).click()
await page.waitForTimeout(400)

const codeEl = page.locator('[aria-label^="配对码 "]')
const before = await codeEl.getAttribute('aria-label')
const copyBtnCount = await page.getByRole('button', { name: '复制配对码' }).count()
check(copyBtnCount === 0, '配对码旁没有复制按钮了')

await page.getByRole('button', { name: '刷新配对码' }).click()
await page.waitForTimeout(500)
const after = await codeEl.getAttribute('aria-label')
check(before !== after, '刷新后配对码换了一个', `${before} → ${after}`)

console.log(failed === 0 ? '\n全部通过' : `\n有 ${failed} 项没通过`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
