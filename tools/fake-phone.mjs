#!/usr/bin/env node
// 假手机端 —— 开发期用来验证电脑端协议，不依赖安卓设备。
//
//   node tools/fake-phone.mjs                 # 连上，打印收到的所有消息
//   node tools/fake-phone.mjs --pair          # 走「手机发起、电脑确认」配对
//   node tools/fake-phone.mjs --code 123456   # 走「输配对码」配对
//   node tools/fake-phone.mjs --hotkey cmd+shift+v
//
// 选项：
//   --host <地址>   默认 127.0.0.1
//   --port <端口>   默认 47471
//   --name <设备名> 默认 Fake Phone

import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// token 存本地文件（模拟手机端的持久化），不要写在命令行里
const tokenFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.fake-phone-token.json')
function readState() {
  try {
    return JSON.parse(fs.readFileSync(tokenFile, 'utf8'))
  } catch {
    return {}
  }
}
function writeState(patch) {
  fs.writeFileSync(tokenFile, JSON.stringify({ ...readState(), ...patch }, null, 2))
}

const args = process.argv.slice(2)
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return fallback
  const next = args[index + 1]
  return next && !next.startsWith('--') ? next : true
}

const host = flag('host', '127.0.0.1')
const port = Number(flag('port', 47471))
const deviceName = flag('name', 'Fake Phone')
// 设备 id 要稳定（真实手机端也是固定 id），否则 token 对不上
const saved = readState()
const deviceId = saved.deviceId ?? `fake-${Math.random().toString(36).slice(2, 8)}`
writeState({ deviceId })

const socket = net.createConnection({ host, port })
let buffer = ''

function send(message) {
  socket.write(JSON.stringify(message) + '\n')
  console.log('→', message.type, JSON.stringify(message).slice(0, 160))
}

socket.on('connect', () => {
  console.log(`已连上 ${host}:${port}（设备 id ${deviceId}）`)
  send({
    type: 'hello',
    protocolVersion: 1,
    deviceId,
    deviceName,
    model: 'Dev Harness',
    token: flag('token') || saved.token,
  })

  if (flag('pair')) {
    setTimeout(() => send({ type: 'pair.request', deviceId, deviceName, model: 'Dev Harness' }), 200)
  }
  if (flag('code')) {
    setTimeout(() => send({ type: 'pair.code', deviceId, deviceName, code: String(flag('code')) }), 200)
  }
  if (flag('hotkey')) {
    const combo = String(flag('hotkey')).split('+')
    setTimeout(() => send({ type: 'hotkey.execute', combo }), 400)
  }
})

socket.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  let index
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    if (!line.trim()) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      console.log('← (无法解析)', line.slice(0, 120))
      continue
    }
    console.log('←', message.type, JSON.stringify(message).slice(0, 200))
    if (message.token) writeState({ token: message.token })
  }
})

socket.on('error', (error) => {
  console.error('连接失败：', error.message)
  process.exit(1)
})

socket.on('close', () => {
  console.log('连接已关闭')
  process.exit(0)
})
