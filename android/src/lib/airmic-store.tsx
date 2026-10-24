import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  SEED_MAGNETS,
  SEED_PRESETS,
  type Device,
  type ForegroundApp,
  type Preset,
  type Stats,
} from './airmic-data'
import { EMPTY_STATS } from './airmic-data'
import type { HotkeyMagnet } from './hotkey'
import { createTransport, type AirMicTransport } from './transport'

/**
 * 手机端共享状态
 * ------------------------------------------------------------
 * ⚠️ **接口形状与原型保持一致**（原型 src/lib/airmic-store.tsx），
 * 只是数据来源从「内存里的假数据」换成了「原生通道 + 本地持久化」。
 * 组件一行都不用改。
 */

export type MicMode = 'idle' | 'continuous' | 'ptt'

export type PairingRequest = {
  deviceId: string
  deviceName: string
  model: string
}

export type PresetNotice = {
  /** 递增 id，用来重新触发同一条提示的强调动画 */
  seq: number
  name: string
  /** 是否是回落到默认预案 */
  fallback: boolean
  /** 对应的前台应用名 */
  appName: string
}

export type AudioOutputDevice = {
  id: string
  name: string
  virtual?: boolean
}

/** 电脑端选中的输出设备由电脑端自己管，手机端只读 */
export const OUTPUT_DEVICES: AudioOutputDevice[] = []

const STORAGE_KEY = 'airmic.phone.v1'

type Persisted = {
  token: string | null
  deviceId: string | null
  deviceName: string | null
  magnets: HotkeyMagnet[]
  presets: Preset[]
}

function loadPersisted(): Persisted {
  const fallback: Persisted = {
    token: null,
    deviceId: null,
    deviceName: null,
    magnets: SEED_MAGNETS,
    presets: SEED_PRESETS,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return {
      token: parsed.token ?? null,
      deviceId: parsed.deviceId ?? null,
      deviceName: parsed.deviceName ?? null,
      magnets: parsed.magnets?.length ? parsed.magnets : SEED_MAGNETS,
      presets: parsed.presets?.length ? parsed.presets : SEED_PRESETS,
    }
  } catch {
    return fallback
  }
}

export type AirmicStore = {
  /* --- 连接 --- */
  paired: boolean
  pairedDevice: Device | null
  knownDevices: Device[]
  devices: Device[]
  scanning: boolean
  pairingRequest: PairingRequest | null

  /* --- 电脑端 --- */
  foregroundApp: ForegroundApp
  serverRunning: boolean
  outputDeviceId: string
  stats: Stats
  bufferMs: number
  testToneOn: boolean
  pairCode: string

  /* --- 手机端 --- */
  micMode: MicMode
  magnets: HotkeyMagnet[]
  presets: Preset[]
  activePresetId: string
  presetNotice: PresetNotice | null
  /** 电脑端没有在收音时的提示（硬约束 15） */
  micBlockedNotice: string | null
  /** 电脑端观察到的前台应用集合（配预案时列出来） */
  knownApps: string[]
  connectionError: string | null

  /* --- 动作 --- */
  startScan: () => void
  requestPair: (deviceId: string) => void
  approvePairing: () => void
  rejectPairing: () => void
  pairByCode: (code: string) => { ok: boolean; message: string }
  refreshPairCode: () => void
  connectTo: (deviceId: string) => void
  unpairDevice: (deviceId: string) => void
  disconnect: () => void
  unpair: () => void

  setForegroundApp: (appName: string) => void
  toggleServer: () => void
  setOutputDevice: (id: string) => void
  setBufferMs: (ms: number) => void
  toggleTestTone: () => void

  toggleContinuous: () => void
  startPushToTalk: () => void
  endPushToTalk: () => void

  createPreset: (name: string) => void
  updatePreset: (id: string, patch: Partial<Preset>) => void
  deletePreset: (id: string) => void

  /* --- 磁铁 --- */
  addMagnet: (magnet: Omit<HotkeyMagnet, 'id'>) => string
  updateMagnet: (id: string, patch: Partial<HotkeyMagnet>) => void
  deleteMagnet: (id: string) => void

  dismissMicBlocked: () => void
}

const AirmicContext = createContext<AirmicStore | null>(null)

export function AirmicProvider({ children }: { children: ReactNode }) {
  const persisted = useRef(loadPersisted()).current
  const transport = useRef<AirMicTransport>(createTransport()).current

  const [paired, setPaired] = useState(false)
  const [pairedDevice, setPairedDevice] = useState<Device | null>(null)
  const [knownDevices, setKnownDevices] = useState<Device[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [scanning, setScanning] = useState(false)
  const [pairingRequest, setPairingRequest] = useState<PairingRequest | null>(null)

  const [foregroundApp, setForegroundAppState] = useState<ForegroundApp>({
    name: '',
    bundleId: '',
    hasPreset: false,
  })
  const [serverRunning, setServerRunning] = useState(true)
  const [outputDeviceId, setOutputDeviceId] = useState('')
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [bufferMs, setBufferMsState] = useState(EMPTY_STATS.bufferMs)
  const [testToneOn, setTestToneOn] = useState(false)
  const [pairCode, setPairCode] = useState('')

  const [micMode, setMicMode] = useState<MicMode>('idle')
  const [magnets, setMagnets] = useState<HotkeyMagnet[]>(persisted.magnets)
  const [presets, setPresets] = useState<Preset[]>(persisted.presets)
  const [activePresetId, setActivePresetId] = useState<string>(
    persisted.presets.find((p) => p.isDefault)?.id ?? persisted.presets[0]?.id ?? '',
  )
  const [presetNotice, setPresetNotice] = useState<PresetNotice | null>(null)
  const [micBlockedNotice, setMicBlockedNotice] = useState<string | null>(null)
  const [knownApps, setKnownApps] = useState<string[]>([])
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const noticeSeq = useRef(0)
  /** 本机设备信息（原生侧生成，JS 侧发消息时必须带同一个 deviceId） */
  const [deviceInfo, setDeviceInfo] = useState({ deviceId: '', deviceName: '' })

  /* ---------- 持久化 ---------- */
  const persist = useCallback(
    (patch: Partial<Persisted>) => {
      const next: Persisted = {
        token: persisted.token,
        deviceId: persisted.deviceId,
        deviceName: persisted.deviceName,
        magnets,
        presets,
        ...patch,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* 存不下就算了，不影响本次会话 */
      }
    },
    [persisted, magnets, presets],
  )

  const send = useCallback(
    (message: Record<string, unknown>) => {
      void transport.send(message)
    },
    [transport],
  )

  /** 把当前配置推给电脑端（磁贴按下要在电脑上执行，电脑必须知道键位） */
  const pushConfig = useCallback(
    (nextMagnets: HotkeyMagnet[], nextPresets: Preset[]) => {
      send({ type: 'config.push', magnets: nextMagnets, presets: nextPresets })
    },
    [send],
  )

  /* ---------- 本机设备信息 ---------- */
  useEffect(() => {
    void transport
      .getDeviceInfo()
      .then((info) => setDeviceInfo(info))
      .catch(() => {
        /* 拿不到就先用空串 */
      })
  }, [transport])

  /* ---------- 收到电脑端的消息 ---------- */
  useEffect(() => {
    transport.onMessage((message) => {
      switch (message.type) {
        case 'welcome': {
          const required = message.pairingRequired === true
          setPaired(!required)
          if (!required) {
            setConnectionError(null)
          }
          if (message.server) applyServerState(message.server)
          break
        }
        case 'pair.respond': {
          if (message.approved === true && message.token) {
            setPaired(true)
            setPairingRequest(null)
            persist({ token: message.token })
            // 原生侧也存一份，重连时自动带上
            void transport.saveToken(deviceInfo.deviceId, message.token)
          } else {
            setPairingRequest(null)
          }
          break
        }
        case 'pair.result': {
          if (message.ok === true && message.token) {
            setPaired(true)
            persist({ token: message.token })
            void transport.saveToken(deviceInfo.deviceId, message.token)
          }
          break
        }
        case 'state':
          if (message.server) applyServerState(message.server)
          break
        case 'preset.active': {
          noticeSeq.current += 1
          setActivePresetId(message.presetId)
          setPresetNotice({
            seq: noticeSeq.current,
            name: message.name,
            fallback: message.fallback === true,
            appName: message.appName ?? '',
          })
          break
        }
        case 'apps.list':
          if (Array.isArray(message.apps)) setKnownApps(message.apps)
          break
        case 'stats':
          if (message.stats) {
            setStats({
              packetLoss: message.stats.packetLoss ?? null,
              jitter: message.stats.jitterMs ?? null,
              underrun: message.stats.underruns ?? null,
              latency: message.stats.latencyMs ?? null,
              bufferMs,
            })
          }
          break
        case 'mic.state':
          setServerRunning(message.mode !== 'idle')
          break
        default:
          break
      }
    })

    transport.onConnection((state) => {
      if (!state.connected && state.error) {
        setConnectionError(state.error)
      }
    })
  }, [bufferMs, deviceInfo.deviceId, persist, transport])

  const applyServerState = useCallback((server: any) => {
    // serverRunning = 电脑端当前有没有在收音（手机据此提示「声音传不过去」）
    if (typeof server.recording === 'boolean') setServerRunning(server.recording)
    if (server.foregroundApp) {
      setForegroundAppState({
        name: server.foregroundApp,
        bundleId: server.foregroundBundleId ?? '',
        hasPreset: false,
      })
    }
    if (typeof server.bufferMs === 'number') setBufferMsState(server.bufferMs)
    if (server.outputDeviceId) setOutputDeviceId(server.outputDeviceId)
  }, [])

  /* ---------- 扫描 ---------- */
  const startScan = useCallback(() => {
    setScanning(true)
    void transport
      .scan()
      .then((list) => {
        setDevices(list)
        setKnownDevices((current) => {
          const map = new Map(current.map((d) => [d.id, d]))
          for (const device of list) {
            const known = map.get(device.id)
            if (known) map.set(device.id, { ...device, paired: true })
          }
          return Array.from(map.values())
        })
      })
      .catch(() => {
        setConnectionError('扫描失败，确认手机和电脑在同一个 Wi-Fi 下')
      })
      .finally(() => setScanning(false))
  }, [transport])

  /* ---------- 配对 ---------- */
  const requestPair = useCallback(
    (deviceId: string) => {
      const device = devices.find((d) => d.id === deviceId)
      if (!device) return
      setPairingRequest({
        deviceId: device.id,
        deviceName: device.name,
        model: device.model,
      })
      send({
        type: 'pair.request',
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName || device.name,
        model: deviceInfo.deviceName,
      })
    },
    [deviceInfo.deviceId, deviceInfo.deviceName, devices, send],
  )

  const approvePairing = useCallback(() => setPairingRequest(null), [])
  const rejectPairing = useCallback(() => setPairingRequest(null), [])

  const pairByCode = useCallback(
    (code: string) => {
      const trimmed = code.trim()
      if (trimmed.length !== 6) {
        return { ok: false, message: '配对码是 6 位数字，再数一遍' }
      }
      if (!/^\d{6}$/.test(trimmed)) {
        return { ok: false, message: '配对码只能有数字，重新输入' }
      }
      send({
        type: 'pair.code',
        code: trimmed,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName || 'Android 手机',
      })
      // 结果由 pair.result 异步回来，这里先给个「已提交」的回执
      return { ok: true, message: '已提交配对码，等电脑端确认' }
    },
    [deviceInfo.deviceId, deviceInfo.deviceName, send],
  )

  const refreshPairCode = useCallback(() => {
    /* 配对码由电脑端生成，手机端没有刷新入口 */
  }, [])

  /** 已配对设备：点一下直接连上，不请求同意 */
  const connectTo = useCallback(
    (deviceId: string) => {
      const device = devices.find((d) => d.id === deviceId) ?? knownDevices.find((d) => d.id === deviceId)
      if (!device) return
      void transport
        .connect({ deviceId: device.id, host: device.host ?? '', port: device.port ?? 47471 })
        .then(() => {
          setPairedDevice(device)
          persist({ deviceId: device.id, deviceName: device.name })
        })
        .catch((error: Error) => {
          setConnectionError(error.message || '连接失败，确认电脑端还在运行')
        })
    },
    [devices, knownDevices, persist, transport],
  )

  const unpairDevice = useCallback((deviceId: string) => {
    setKnownDevices((list) => list.filter((d) => d.id !== deviceId))
    if (pairedDevice?.id === deviceId) {
      setPairedDevice(null)
      setPaired(false)
    }
  }, [pairedDevice])

  const disconnect = useCallback(() => {
    void transport.disconnect()
    setPaired(false)
    setMicMode('idle')
  }, [transport])

  const unpair = useCallback(() => {
    void transport.disconnect()
    setPaired(false)
    setPairedDevice(null)
    setMicMode('idle')
    setKnownDevices([])
    persist({ token: null, deviceId: null, deviceName: null })
  }, [persist, transport])

  /* ---------- 电脑端（手机端只读，改动要去电脑端） ---------- */
  const setForegroundApp = useCallback(() => {
    /* 前台应用由电脑端上报，手机端不能自己改 */
  }, [])
  const toggleServer = useCallback(() => {
    /* 收音开关在电脑端面板上 */
  }, [])
  const setOutputDevice = useCallback(() => {
    /* 输出设备在电脑端选 */
  }, [])
  const setBufferMs = useCallback(() => {
    /* 抖动缓冲在电脑端调 */
  }, [])
  const toggleTestTone = useCallback(() => {
    setTestToneOn((v) => !v)
  }, [])

  /* ---------- 麦克风按钮双语义 ---------- */
  const beginCapture = useCallback(
    (mode: 'continuous' | 'ptt') => {
      send({ type: 'mic.state.report', mode })
      void transport.startMic(mode)
    },
    [send, transport],
  )

  const stopCapture = useCallback(() => {
    send({ type: 'mic.state.report', mode: 'idle' })
    void transport.stopMic()
  }, [send, transport])

  /**
   * 电脑端没有在收音时，手机开始收音要**震动 + 提示**（硬约束 15）。
   * 震动用 navigator.vibrate —— iOS 没有这个 API，必须做保护。
   */
  const warnIfServerIdle = useCallback(() => {
    if (serverRunning) return
    setMicBlockedNotice('电脑端没有在收音，声音传不过去')
    try {
      navigator.vibrate?.([120, 60, 120])
    } catch {
      /* 不支持震动就算了，视觉提示才是主要渠道 */
    }
  }, [serverRunning])

  const toggleContinuous = useCallback(() => {
    setMicMode((m) => {
      if (m === 'ptt') return m
      if (m === 'continuous') {
        stopCapture()
        return 'idle'
      }
      warnIfServerIdle()
      beginCapture('continuous')
      return 'continuous'
    })
  }, [beginCapture, stopCapture, warnIfServerIdle])

  const startPushToTalk = useCallback(() => {
    warnIfServerIdle()
    setMicMode('ptt')
    beginCapture('ptt')
  }, [beginCapture, warnIfServerIdle])

  const endPushToTalk = useCallback(() => {
    setMicMode((m) => (m === 'ptt' ? 'idle' : m))
    stopCapture()
  }, [stopCapture])

  const dismissMicBlocked = useCallback(() => setMicBlockedNotice(null), [])

  /* ---------- 预案管理 ---------- */
  const createPreset = useCallback(
    (name: string) => {
      const id = `p-${Date.now().toString(36)}`
      const next = [
        ...presets,
        {
          id,
          name: name.trim() || '新预案',
          appName: null,
          micPressId: null,
          micReleaseId: null,
          tiles: [],
        },
      ]
      setPresets(next)
      persist({ presets: next })
      pushConfig(magnets, next)
    },
    [magnets, persist, presets, pushConfig],
  )

  const updatePreset = useCallback(
    (id: string, patch: Partial<Preset>) => {
      const next = presets.map((p) => (p.id === id ? { ...p, ...patch } : p))
      setPresets(next)
      persist({ presets: next })
      pushConfig(magnets, next)
    },
    [magnets, persist, presets, pushConfig],
  )

  const deletePreset = useCallback(
    (id: string) => {
      const target = presets.find((p) => p.id === id)
      if (!target || target.isDefault) return
      const next = presets.filter((p) => p.id !== id)
      setPresets(next)
      persist({ presets: next })
      pushConfig(magnets, next)
    },
    [magnets, persist, presets, pushConfig],
  )

  /* ---------- 磁铁管理 ---------- */
  const addMagnet = useCallback(
    (magnet: Omit<HotkeyMagnet, 'id'>) => {
      const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const next = [...magnets, { ...magnet, id }]
      setMagnets(next)
      persist({ magnets: next })
      pushConfig(next, presets)
      return id
    },
    [magnets, persist, presets, pushConfig],
  )

  const updateMagnet = useCallback(
    (id: string, patch: Partial<HotkeyMagnet>) => {
      const next = magnets.map((m) => (m.id === id ? { ...m, ...patch } : m))
      setMagnets(next)
      persist({ magnets: next })
      pushConfig(next, presets)
    },
    [magnets, persist, presets, pushConfig],
  )

  /** 删磁铁要把所有预案里的引用一起清掉 */
  const deleteMagnet = useCallback(
    (id: string) => {
      const nextMagnets = magnets.filter((m) => m.id !== id)
      const nextPresets = presets.map((p) => ({
        ...p,
        micPressId: p.micPressId === id ? null : p.micPressId,
        micReleaseId: p.micReleaseId === id ? null : p.micReleaseId,
        tiles: p.tiles.filter((t) => t.magnetId !== id),
      }))
      setMagnets(nextMagnets)
      setPresets(nextPresets)
      persist({ magnets: nextMagnets, presets: nextPresets })
      pushConfig(nextMagnets, nextPresets)
    },
    [magnets, persist, presets, pushConfig],
  )

  const store = useMemo<AirmicStore>(
    () => ({
      paired,
      pairedDevice,
      knownDevices,
      devices,
      scanning,
      pairingRequest,
      foregroundApp,
      serverRunning,
      outputDeviceId,
      stats,
      bufferMs,
      testToneOn,
      pairCode,
      micMode,
      magnets,
      presets,
      activePresetId,
      presetNotice,
      micBlockedNotice,
      knownApps,
      connectionError,
      startScan,
      requestPair,
      approvePairing,
      rejectPairing,
      pairByCode,
      refreshPairCode,
      connectTo,
      unpairDevice,
      disconnect,
      unpair,
      setForegroundApp,
      toggleServer,
      setOutputDevice,
      setBufferMs,
      toggleTestTone,
      toggleContinuous,
      startPushToTalk,
      endPushToTalk,
      createPreset,
      updatePreset,
      deletePreset,
      addMagnet,
      updateMagnet,
      deleteMagnet,
      dismissMicBlocked,
    }),
    [
      paired,
      pairedDevice,
      knownDevices,
      devices,
      scanning,
      pairingRequest,
      foregroundApp,
      serverRunning,
      outputDeviceId,
      stats,
      bufferMs,
      testToneOn,
      pairCode,
      micMode,
      magnets,
      presets,
      activePresetId,
      presetNotice,
      micBlockedNotice,
      knownApps,
      connectionError,
      startScan,
      requestPair,
      approvePairing,
      rejectPairing,
      pairByCode,
      refreshPairCode,
      connectTo,
      unpairDevice,
      disconnect,
      unpair,
      setForegroundApp,
      toggleServer,
      setOutputDevice,
      setBufferMs,
      toggleTestTone,
      toggleContinuous,
      startPushToTalk,
      endPushToTalk,
      createPreset,
      updatePreset,
      deletePreset,
      addMagnet,
      updateMagnet,
      deleteMagnet,
      dismissMicBlocked,
    ],
  )

  return <AirmicContext.Provider value={store}>{children}</AirmicContext.Provider>
}

export function useAirmic(): AirmicStore {
  const ctx = useContext(AirmicContext)
  if (!ctx) throw new Error('useAirmic 必须在 <AirmicProvider> 内使用')
  return ctx
}

/** 当前生效的预案（磁贴内容以它为准） */
export function useActivePreset(): Preset | undefined {
  const { presets, activePresetId } = useAirmic()
  return useMemo(
    () => presets.find((p) => p.id === activePresetId) ?? presets[0],
    [presets, activePresetId],
  )
}
