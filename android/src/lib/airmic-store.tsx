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
  type KnownApp,
  type Preset,
  type Stats,
} from './airmic-data'
import { EMPTY_STATS } from './airmic-data'
import { magnetCombo, type HotkeyMagnet } from './hotkey'
import { createTransport, type AirMicTransport } from './transport'

/**
 * 手机端共享状态
 * ------------------------------------------------------------
 * ⚠️ **接口形状与原型保持一致**（原型 src/lib/airmic-store.tsx），
 * 只是数据来源从「内存里的假数据」换成了「原生通道 + 本地持久化」。
 * 组件一行都不用改。
 */

export type MicMode = 'idle' | 'continuous' | 'ptt'

/** 外观：跟随系统 / 浅色 / 深色 */
export type ThemeMode = 'system' | 'light' | 'dark'

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
  /** 电脑应用列表（下次打开直接用，不用再拉） */
  appList: KnownApp[]
  /** 上次连的电脑地址（下次打开自动连） */
  deviceHost: string | null
  devicePort: number | null
  /** 外观 */
  theme: ThemeMode
}

function loadPersisted(): Persisted {
  const fallback: Persisted = {
    token: null,
    deviceId: null,
    deviceName: null,
    magnets: SEED_MAGNETS,
    presets: SEED_PRESETS,
    appList: [],
    deviceHost: null,
    devicePort: null,
    theme: 'system',
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
      // 旧版本预案只有单个 appId / appName → 迁移成 appIds
      presets: (parsed.presets?.length ? parsed.presets : SEED_PRESETS).map(
        (preset: Preset) => {
          const appIds = preset.appIds?.length
            ? preset.appIds
            : preset.appId
              ? [preset.appId]
              : preset.appName
                ? [preset.appName]
                : []
          return { ...preset, appIds, micHoldId: preset.micHoldId ?? null }
        },
      ),
      appList: parsed.appList ?? [],
      deviceHost: parsed.deviceHost ?? null,
      devicePort: parsed.devicePort ?? null,
      theme: parsed.theme ?? 'system',
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
  /** 拉下来的电脑应用列表（手机端保存，可重复拉取覆盖） */
  appList: KnownApp[]
  /** 电脑当前的前台应用（只用于显示，不保存） */
  currentApp: KnownApp | null
  /** 电脑端返回的错误（比如快捷键没有权限） */
  remoteError: string | null
  /** 外观模式 */
  themeMode: ThemeMode
  /** 系统栏高度 */
  insets: { top: number; bottom: number }
  /** 真实麦克风电平（0–1）—— 电平表用这个，不是假数据 */
  micLevel: number
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

  /* --- 快捷键 --- */
  /** 点磁贴：让电脑执行这个磁铁的组合键 */
  fireMagnet: (magnet: HotkeyMagnet) => void
  dismissRemoteError: () => void

  /* --- 预案绑定的应用 --- */
  /** 拉取电脑端记录过的所有应用（覆盖本地缓存） */
  fetchAppList: () => void
  /** 取电脑当前的前台应用（不保存） */
  fetchCurrentApp: () => void

  /* --- 外观 --- */
  setThemeMode: (mode: ThemeMode) => void
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
  /** 电脑应用列表（本地缓存，可重新拉取覆盖） */
  const [appList, setAppList] = useState<KnownApp[]>(persisted.appList)
  /** 电脑当前应用（不保存） */
  const [currentApp, setCurrentApp] = useState<KnownApp | null>(null)
  /** 电脑端返回的错误 */
  const [remoteError, setRemoteError] = useState<string | null>(null)
  /** 正在配对的那台电脑（配对成功后用来填 pairedDevice，顶部要显示设备名） */
  const [pairingDevice, setPairingDevice] = useState<Device | null>(null)
  /** 真实麦克风电平（0–1）—— 电平表用这个，不再是假数据 */
  const [micLevel, setMicLevel] = useState(0)
  /** 外观模式 */
  const [themeMode, setThemeModeState] = useState<ThemeMode>(persisted.theme ?? 'system')
  /** 系统栏高度（页面铺满全屏，自己留边距） */
  const [insets, setInsets] = useState({ top: 0, bottom: 0 })
  /** 长按说话时按下的组合键（松开时要还原） */
  const heldComboRef = useRef<string[] | null>(null)
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
        appList,
        deviceHost: persisted.deviceHost,
        devicePort: persisted.devicePort,
        theme: themeMode,
        ...patch,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* 存不下就算了，不影响本次会话 */
      }
    },
    [appList, magnets, persisted, presets, themeMode],
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

  /* ---------- 启动时自动连上上次的电脑 ---------- */
  //
  // 需求：配对一次成功后，下次打开**直接进麦克风页**，不用再点一遍。
  useEffect(() => {
    if (!persisted.token || !persisted.deviceHost) return
    void transport
      .connect({
        deviceId: persisted.deviceId ?? 'saved',
        host: persisted.deviceHost,
        port: persisted.devicePort ?? 47471,
        token: persisted.token ?? undefined,
      })
      .catch(() => {
        /* 连不上就回到设备页，让用户手动刷新 */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- 外观 ---------- */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const resolved: 'light' | 'dark' =
        themeMode === 'system' ? (media.matches ? 'light' : 'dark') : themeMode
      document.documentElement.dataset.theme = resolved
      document.documentElement.classList.toggle('dark', resolved === 'dark')
      void transport.setSystemBars(resolved === 'light')
    }
    apply()
    if (themeMode !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [themeMode, transport])

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode)
      persist({ theme: mode })
    },
    [persist],
  )

  /* ---------- 系统栏高度 ---------- */
  useEffect(() => {
    let cancelled = false
    const read = () => {
      void transport
        .getInsets()
        .then((value) => {
          if (!cancelled) setInsets(value)
        })
        .catch(() => {
          /* 拿不到就不留边距 */
        })
    }
    // WebView 刚起来时可能拿不到，多试几次
    read()
    const timers = [150, 500, 1200].map((ms) => window.setTimeout(read, ms))
    const onVisible = () => {
      if (document.visibilityState === 'visible') read()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('resize', read)
    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('resize', read)
    }
  }, [transport])

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
            // 顶部要显示「已连接 · 设备名」—— 自动重连时也要补上
            if (!pairedDevice) {
              const known =
                devices.find((d) => d.id === persisted.deviceId) ??
                devices[0]
              setPairedDevice(
                known ??
                  ({
                    id: persisted.deviceId ?? '电脑',
                    name: persisted.deviceName ?? '电脑',
                    model: '',
                    signal: 4,
                    paired: true,
                    lastSeen: Date.now(),
                  } as Device),
              )
            }
            // 连上了就把配置推给电脑：磁贴的键位在电脑那边才有效
            pushConfig(magnets, presets)
          }
          if (message.server) applyServerState(message.server)
          break
        }
        case 'pair.respond': {
          if (message.approved === true && message.token) {
            setPaired(true)
            // 顶部要显示「已连接 · 设备名」—— 设备信息这时候才补上
            if (pairingDevice) setPairedDevice(pairingDevice)
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
            if (pairingDevice) setPairedDevice(pairingDevice)
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
        case 'apps.list': {
          // 新协议：带 id 的完整列表
          if (Array.isArray(message.appList)) {
            setAppList(message.appList)
            persist({ appList: message.appList })
          } else if (Array.isArray(message.apps)) {
            setKnownApps(message.apps)
          }
          break
        }
        case 'apps.current':
          if (message.currentApp) setCurrentApp(message.currentApp)
          break
        case 'hotkey.error':
          setRemoteError(message.reason ?? '电脑端执行失败了')
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

    transport.onLevel((level) => {
      setMicLevel(level)
    })

    transport.onConnection((state) => {
      if (!state.connected && state.error) {
        setConnectionError(state.error)
      }
    })
  }, [
    bufferMs,
    deviceInfo.deviceId,
    devices,
    pairedDevice,
    pairingDevice,
    persist,
    persisted.deviceId,
    persisted.deviceName,
    transport,
  ])

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
      setPairingDevice(device)
      // ⚠️ 必须**先连上控制通道**再发配对请求 ——
      // 没连接时消息会被直接丢掉，电脑端收不到（表现为「手机在等、电脑没反应」）。
      void transport
        .connect({
          deviceId: device.id,
          host: device.host ?? '',
          port: device.port ?? 47471,
          token: persisted.token ?? undefined,
        })
        .then(() => {
          send({
            type: 'pair.request',
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName || device.name,
            model: deviceInfo.deviceName,
          })
        })
        .catch((error: Error) => {
          setPairingRequest(null)
          setConnectionError(error.message || '连不上电脑，确认 AirMic 还在运行、手机和电脑在同一个 Wi-Fi 下')
        })
    },
    [deviceInfo.deviceId, deviceInfo.deviceName, devices, send, transport],
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
          persist({
            deviceId: device.id,
            deviceName: device.name,
            deviceHost: device.host ?? null,
            devicePort: device.port ?? null,
          })
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
    async (mode: 'continuous' | 'ptt') => {
      // 没有麦克风权限就别硬来 —— 直接告诉用户要开哪个权限
      let granted = await transport.hasMicPermission()
      if (!granted) {
        granted = await transport.requestMicPermission()
      }
      if (!granted) {
        setMicBlockedNotice('需要「麦克风」权限才能收音，去系统设置里给 AirMic 开一下')
        return false
      }
      send({ type: 'mic.state.report', mode })
      try {
        await transport.startMic(mode)
      } catch (error: any) {
        setMicBlockedNotice(error?.message || '麦克风启动失败')
        return false
      }
      return true
    },
    [send, transport],
  )

  const stopCapture = useCallback(() => {
    send({ type: 'mic.state.report', mode: 'idle' })
    void transport.stopMic()
    setMicLevel(0)
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

  /**
   * 当前预案里麦克风按钮绑定的磁铁
   *
   * ⚠️ 这是「麦克风按钮自己的绑定」，和底部独立磁贴是两件事。
   */
  const presetMagnet = useCallback(
    (which: 'press' | 'release' | 'hold') => {
      const preset = presets.find((p) => p.id === activePresetId)
      const id =
        which === 'press'
          ? preset?.micPressId
          : which === 'release'
            ? preset?.micReleaseId
            : preset?.micHoldId
      if (!id) return null
      return magnets.find((m) => m.id === id) ?? null
    },
    [activePresetId, magnets, presets],
  )

  /**
   * 点按语义：开 / 关各触发一次（按下 → 抬起）
   */
  const fireTap = useCallback(
    (magnet: HotkeyMagnet | null) => {
      if (!magnet) return
      const combo = magnetCombo(magnet)
      if (combo.length === 0) return
      send({ type: 'hotkey.execute', combo })
    },
    [send],
  )

  const toggleContinuous = useCallback(() => {
    if (micMode === 'ptt') return
    if (micMode === 'continuous') {
      stopCapture()
      // 关闭麦克风 → 触发「松开」磁铁
      fireTap(presetMagnet('release'))
      setMicMode('idle')
      return
    }
    warnIfServerIdle()
    // 打开麦克风 → 触发「按下」磁铁
    fireTap(presetMagnet('press'))
    void beginCapture('continuous')
    setMicMode('continuous')
  }, [beginCapture, fireTap, micMode, presetMagnet, stopCapture, warnIfServerIdle])

  const startPushToTalk = useCallback(() => {
    if (micMode === 'ptt') return
    warnIfServerIdle()
    // 长按语义：按下组合键但**不松开**，等手指抬起来才还原
    // 用的是「长按」自己绑定的磁铁，与「按下 / 松开」互相独立
    const magnet = presetMagnet('hold')
    if (magnet) {
      const combo = magnetCombo(magnet)
      if (combo.length > 0) {
        heldComboRef.current = combo
        send({ type: 'hotkey.down', combo })
      }
    }
    setMicMode('ptt')
    void beginCapture('ptt')
  }, [beginCapture, micMode, presetMagnet, send, warnIfServerIdle])

  const endPushToTalk = useCallback(() => {
    if (micMode !== 'ptt') return
    // 松开手指 → 松开组合键
    if (heldComboRef.current) {
      send({ type: 'hotkey.up', combo: heldComboRef.current })
      heldComboRef.current = null
    }
    setMicMode('idle')
    stopCapture()
  }, [micMode, send, stopCapture])

  const dismissMicBlocked = useCallback(() => setMicBlockedNotice(null), [])
  const dismissRemoteError = useCallback(() => setRemoteError(null), [])

  /* ---------- 快捷键 ---------- */

  /** 点磁贴：把组合键发给电脑执行 */
  const fireMagnet = useCallback(
    (magnet: HotkeyMagnet) => {
      const combo = magnetCombo(magnet)
      if (combo.length === 0) return
      send({ type: 'hotkey.execute', combo })
    },
    [send],
  )

  /* ---------- 预案绑定的应用 ---------- */

  /** 拉取电脑端记录过的所有应用（覆盖本地缓存） */
  const fetchAppList = useCallback(() => {
    send({ type: 'apps.request' })
  }, [send])

  /** 取电脑当前的前台应用（不保存） */
  const fetchCurrentApp = useCallback(() => {
    send({ type: 'apps.current.request' })
  }, [send])

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
      let next = presets.map((p) => (p.id === id ? { ...p, ...patch } : p))
      // 一个应用只能绑一个预案：从别的预案里摘掉
      if (patch.appIds) {
        const claimed = new Set(patch.appIds)
        next = next.map((p) =>
          p.id === id
            ? p
            : { ...p, appIds: (p.appIds ?? []).filter((a) => !claimed.has(a)) },
        )
      }
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
      appList,
      currentApp,
      remoteError,
      micLevel,
      themeMode,
      insets,
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
      fireMagnet,
      dismissRemoteError,
      fetchAppList,
      fetchCurrentApp,
      setThemeMode,
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
      appList,
      currentApp,
      remoteError,
      micLevel,
      themeMode,
      insets,
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
      fireMagnet,
      dismissRemoteError,
      fetchAppList,
      fetchCurrentApp,
      setThemeMode,
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
