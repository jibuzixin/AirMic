import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 打包交接物
 * ------------------------------------------------------------
 * 给下一个 agent 的资料包 = 可运行原型 + 全部文档 + 验证脚本。
 *
 * 刻意**不带**的东西：
 *   - node_modules（重新 `npm install` 就行，包里放几百 MB 没意义）
 *   - dist（构建产物）
 *   - .DS_Store / *.tsbuildinfo（macOS 垃圾）
 *
 * 打包内容是显式白名单 —— 少一个文件就是交接事故，多一个文件只是噪音。
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STAGE = '/tmp/airmic-handoff-stage'
const OUT = join(ROOT, 'airmic-handoff-v0.6.zip')

/** 要打包的顶层条目（文件或目录） */
const INCLUDE = [
  // 文档 —— 交接的全部上下文
  '开发须知.md', // ← 入口：写给接手开发的 agent
  '需求说明书.md',
  'DESIGN.md',
  'HANDOFF.md',
  'START-HERE.md',
  'README.md',
  // 原型源码
  'src',
  'public',
  'scripts',
  'docs',
  'research',
  // 工程配置
  'index.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'components.json',
  '.oxlintrc.json',
  '.gitignore',
]

/** 要排除的路径模式 */
const EXCLUDE = [/(^|\/)\.DS_Store$/, /\.tsbuildinfo$/, /(^|\/)node_modules$/, /(^|\/)dist$/, /\.zip$/]

function copyFiltered(src, dest) {
  const st = statSync(src)
  if (!st.isDirectory()) {
    cpSync(src, dest)
    return
  }
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const from = `${src}/${entry}`
    if (EXCLUDE.some((re) => re.test(from))) continue
    copyFiltered(from, `${dest}/${entry}`)
  }
}

rmSync(STAGE, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })

const missing = []
for (const item of INCLUDE) {
  const from = join(ROOT, item)
  if (!existsSync(from)) {
    missing.push(item)
    continue
  }
  copyFiltered(from, join(STAGE, item))
}

if (missing.length) {
  console.error('❌ 以下条目不存在：', missing.join(', '))
  process.exit(1)
}

// 自检：包里必须有这些文件，缺一个就是交接事故
const MUST = [
  '开发须知.md',
  '需求说明书.md',
  'DESIGN.md',
  'HANDOFF.md',
  'START-HERE.md',
  'package.json',
  'package-lock.json',
  'src/App.tsx',
  'src/lib/hotkey.ts',
  'src/lib/airmic-store.tsx',
  'scripts/screenshots.mjs',
  'scripts/fix-check.mjs',
]
const absent = MUST.filter((f) => !existsSync(join(STAGE, f)))
if (absent.length) {
  console.error('❌ 包里缺关键文件：', absent.join(', '))
  process.exit(1)
}

rmSync(OUT, { force: true })

/**
 * 打包成 zip。
 *
 * 优先用 Python 的 zipfile —— 它会自动给非 ASCII 文件名置 UTF-8 标记（通用位 11），
 * 跨平台解压不会乱码。macOS 自带的 `zip` 不支持 `-UN=UTF8`，
 * 而且默认不置这个标记，某些解压工具会把「开发须知.md」解成乱码。
 * 没有 python3 时退回 `zip`（macOS Archive Utility 能正常解，只是跨平台有风险）。
 */
function zipWithPython() {
  const py = `
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(stage):
        dirs.sort(); files.sort()
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, stage))
`
  execFileSync('python3', ['-c', py, STAGE, OUT], { stdio: ['ignore', 'inherit', 'inherit'] })
}

let via = 'python3'
try {
  zipWithPython()
} catch {
  via = 'zip(无 UTF-8 标记)'
  execFileSync('zip', ['-r', '-q', '-X', OUT, '.'], { cwd: STAGE })
}

const size = (statSync(OUT).size / 1024 / 1024).toFixed(1)
console.log(`✅ 打包完成：${OUT}`)
console.log(`   大小 ${size} MB ｜ 打包方式 ${via}`)
console.log(`   条目 ${INCLUDE.length} 个，关键文件自检 ${MUST.length} 项全部通过`)
console.log(`   暂存目录 ${STAGE}`)
