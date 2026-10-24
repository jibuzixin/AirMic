import { chromium } from 'playwright'

/**
 * 收起「详细设置」后，测量它和下面「已配对设备」之间的实际间距。
 * 之前 Collapse 的 padding 挂在外层，收起后留下 12px 空隙
 * （用户截图里那条空白），padding 挪到内层后应该归零。
 */
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const URL = process.env.AIRMIC_URL ?? 'http://localhost:4173/'
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const gap = async () =>
  page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    const detail = buttons.find((b) => b.textContent?.includes('详细设置'))
    const paired = buttons.find((b) => b.textContent?.includes('已配对设备'))
    if (!detail || !paired) return null
    const a = detail.getBoundingClientRect()
    const b = paired.getBoundingClientRect()
    return Math.round(b.top - a.bottom)
  })

const advanced = page.getByRole('button', { name: /详细设置/ })
const paired = page.getByRole('button', { name: /已配对设备/ })

console.log('初始（都没展开）间距:', await gap(), 'px')

await advanced.click()
await page.waitForTimeout(700)
console.log('展开后间距:', await gap(), 'px')

await advanced.click()
await page.waitForTimeout(120)
console.log('收起 120ms 时:', await gap(), 'px')
await page.waitForTimeout(800)
console.log('收起完成后:', await gap(), 'px')

const panel = page.locator('[aria-label="AirMic 菜单栏面板"]')
await panel.screenshot({ path: '/tmp/airmic-anim/collapsed.png' })

const g = await gap()
console.log(g <= 2 ? '✅ 收起后没有残留空隙' : `❌ 还剩 ${g}px 空隙`)

/* ---------- 逐帧采样：看收起过程有没有突然跳变 ---------- */
// 先确保是展开状态，再采样收起
const isOpen = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('详细设置'))
  return b?.getAttribute('aria-expanded') === 'true'
})
if (!isOpen) { await advanced.click(); await page.waitForTimeout(800) }

await page.evaluate(() => {
  window.__gaps = []
  const t0 = performance.now()
  const tick = () => {
    const buttons = [...document.querySelectorAll('button')]
    const detail = buttons.find((b) => b.textContent?.includes('详细设置'))
    const paired = buttons.find((b) => b.textContent?.includes('已配对设备'))
    if (detail && paired) {
      window.__gaps.push(
        Math.round(paired.getBoundingClientRect().top - detail.getBoundingClientRect().bottom),
      )
      window.__t = window.__t || []
      window.__t.push(Math.round(performance.now() - t0))
    }
    if (performance.now() - t0 < 900) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
await advanced.click()
await page.waitForTimeout(900)
const gaps = await page.evaluate(() => window.__gaps)
const ts = await page.evaluate(() => window.__t)
console.log('采样帧间隔(ms):', ts.slice(1, 8).map((t, i) => t - ts[i]).join(' '))
const started = ts.findIndex((_, i) => i > 0 && gaps[i] < gaps[i - 1])
const ended = gaps.findIndex((g, i) => i > 2 && g <= 2 && gaps[i - 1] > 2)
if (started >= 0 && ended > started) {
  console.log(`收起耗时: ${ts[ended] - ts[started]} ms（DESIGN 限 480ms）`)
}
let maxJump = 0
let jumpAt = -1
for (let i = 1; i < gaps.length; i++) {
  const d = Math.abs(gaps[i] - gaps[i - 1])
  if (d > maxJump) { maxJump = d; jumpAt = i }
}
console.log('前 20 帧间距序列:', gaps.slice(0, 20).join(' '))
console.log('最后 10 帧间距序列:', gaps.slice(-10).join(' '))
console.log('收起过程采样帧数:', gaps.length)
console.log('单帧最大位移:', maxJump, 'px（第', jumpAt, '帧）')
// 单帧最大位移是 spring 的峰值速度，不是「突跳」。
// 真正的突跳要看尾部：收起快结束时应该平滑减速到 0。
const tail = gaps.slice(-14)
let tailJump = 0
for (let i = 1; i < tail.length; i++) tailJump = Math.max(tailJump, Math.abs(tail[i] - tail[i - 1]))
console.log('收尾阶段单帧最大位移:', tailJump, 'px（越小越平滑）')
console.log(
  tailJump <= 8
    ? '✅ 收尾平滑减速，没有「最后一下卡一下」'
    : '⚠️ 收尾有跳变',
)

await browser.close()
