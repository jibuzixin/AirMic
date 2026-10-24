import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * 原型验证截图
 * ------------------------------------------------------------
 * 覆盖 需求说明书.md §5 的 7 步演示脚本 + 本轮新增的三条：
 *   - 已配对设备点击直接连接（不需要电脑端同意）
 *   - 电脑端删除配对信息后，手机端必须重新配对
 *   - 预案编辑里能真正设置快捷键
 */
const OUT = '/tmp/airmic-shots'
mkdirSync(OUT, { recursive: true })
const URL = process.env.AIRMIC_URL ?? 'http://localhost:4173/'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 2,
})

const shot = async (name) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name)
}

const consoleCol = () => page.locator('section', { hasText: '演示控制台' }).first()
const phone = () => page.locator('div').filter({ hasText: /^选择设备|^Mavis 的 iPhone/ }).last()

await page.goto(URL, { waitUntil: 'networkidle' })
await shot('01-初始-并排')

/* --- 麦克风按钮双语义 --- */
await page.getByRole('button', { name: '开始收音' }).last().click()
await shot('02-常开收音-琥珀')

const mic = page.getByRole('button', { name: '停止收音' }).last()
await mic.dispatchEvent('pointerdown')
await page.waitForTimeout(420)
await shot('03-长按-瞬时说话-红')
await mic.dispatchEvent('pointerup')
await shot('04-松开即停')

/* --- 预案自动切换 --- */
await consoleCol().getByRole('button', { name: '微信' }).click()
await shot('05-切微信-聊天预案-常驻条')
await consoleCol().getByRole('button', { name: 'Safari' }).click()
await shot('06-切Safari-回默认预案')

/* --- 电脑端折叠区 --- */
await page.getByRole('button', { name: /详细设置/ }).click()
await shot('07-电脑端详细设置展开')
await page.getByRole('button', { name: /详细设置/ }).click()

/* --- 断开 → 设备页 --- */
await consoleCol().getByRole('button', { name: '断开连接' }).click()
await shot('08-断开-回到设备页')
await shot('08b-电脑端配对码-刷新按钮')

/* --- 已配对设备：点一下直接连上，不请求同意 --- */
await page.getByRole('button', { name: /Mavis 的 iPhone/ }).last().click()
await page.waitForTimeout(600)
await shot('09-已配对设备-直接连上')

/* --- 未配对设备：才走配对请求 --- */
await consoleCol().getByRole('button', { name: '断开连接' }).click()
await page.getByRole('button', { name: /iPad Air/ }).last().click()
await shot('10-未配对设备-请求配对')
await page.getByRole('button', { name: '允许' }).click()
await shot('11-电脑端允许-重连')

/* --- 电脑端删除配对信息 --- */
await page.getByRole('button', { name: /已配对设备/ }).click()
await shot('12-电脑端已配对设备列表')
await page.getByRole('button', { name: '删除' }).first().click()
await shot('13-删除确认')

/* --- 预案页 + 快捷键设置 --- */
await page.getByRole('button', { name: '预案与设备设置' }).click()
await shot('14-手机端预案页')
await page.getByRole('button', { name: /聊天预案/ }).first().click()
await shot('15-预案编辑抽屉-麦克风绑定')
await page.getByRole('button', { name: /更换磁贴「语音输入」的快捷键/ }).first().click()
await shot('16-磁铁选择器-换磁贴')
// 磁铁选择器在 portal 层，DOM 上排在预案抽屉之后 → 关闭按钮取 .last()
await page.getByRole('button', { name: '关闭' }).last().click()
await page.getByRole('button', { name: '关闭' }).first().click()

/* --- 从麦克风页直接进快捷键设置（麦克风按钮的绑定入口） --- */
await page.getByRole('button', { name: '返回麦克风页' }).click()
await page.getByRole('button', { name: /设置麦克风按钮按下时触发的快捷键/ }).click()
await shot('17-麦克风页直达快捷键设置')

/* --- 磁铁库：新建一个磁铁（选图标 + 起名 + 键盘鼠标菜单） --- */
await page.getByRole('button', { name: /磁铁库/ }).click()
await shot('18-磁铁库展开')
await page.getByRole('button', { name: '新建磁铁' }).click()
await shot('19-新建磁铁-选图标')
await page.getByRole('button', { name: '图标 Zap' }).click()
await page.getByRole('textbox', { name: '磁铁名字' }).fill('静音麦克风')
await page.getByRole('button', { name: '⌘ Command' }).click()
await page.getByRole('button', { name: '⇧ Shift' }).click()
await page.getByRole('button', { name: 'M', exact: true }).click()
await shot('20-键盘鼠标菜单-组合键')
await page.getByRole('button', { name: '保存磁铁' }).click()
await shot('21-磁铁已保存')   // 保存后磁铁编辑器自动关闭

/* --- 磁铁选择器（麦克风按钮选已有磁铁） --- */
await page.getByRole('button', { name: /选择按下时的磁铁/ }).first().click()
await shot('22-麦克风按钮-选磁铁')
await page.getByRole('button', { name: '关闭' }).last().click()
await page.getByRole('button', { name: '关闭' }).first().click()
await page.getByRole('button', { name: '停止收音' }).first().click()
await page.getByRole('button', { name: '开始收音' }).last().click()
await shot('23-电脑端未收音-手机端震动提醒')

console.log('done')
await browser.close()
