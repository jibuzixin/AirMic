import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * 动画逐帧检查
 * ------------------------------------------------------------
 * 展开「详细设置」，持续采样内容层的 opacity，
 * 量出「内容从半透明到完全清晰」到底花了多久。
 *
 * 判定标准：
 *   慢 spring 驱动的 opacity 会拖到 500ms+ → 半透明飘进来 → 不合格
 *   fadeFast（700/45）应该 ~150ms 内到位 → 合格
 */
const OUT = '/tmp/airmic-anim'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const URL = process.env.AIRMIC_URL ?? 'http://localhost:4173/'
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const panel = page.locator('[aria-label="AirMic 菜单栏面板"]')

// 在页面里持续采样
await page.evaluate(() => {
  window.__samples = []
  const t0 = performance.now()
  const tick = () => {
    const el = document.getElementById('airmic-advanced-body')
    if (el) {
      const cs = getComputedStyle(el)
      window.__samples.push({
        t: Math.round(performance.now() - t0),
        opacity: Number(cs.opacity),
      })
    }
    if (performance.now() - t0 < 900) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

await page.getByRole('button', { name: /详细设置/ }).click()

for (const ms of [60, 150, 300, 600]) {
  await page.waitForTimeout(ms)
  await panel.screenshot({ path: `${OUT}/expand-${ms}ms.png` })
}

const samples = await page.evaluate(() => window.__samples)
const blurred = samples.filter((s) => s.opacity < 0.95)
const lastBlur = blurred.length ? blurred[blurred.length - 1].t : 0
console.log('采样帧数:', samples.length)
console.log('opacity < 0.95 的最后一帧:', lastBlur, 'ms')
console.log(
  '结论:',
  lastBlur < 220 ? '✅ 内容很快到位，没有“半透明飘进来”' : '❌ 透明度拖太久，仍然发虚',
)

await browser.close()
