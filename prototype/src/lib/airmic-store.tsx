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
  DEFAULT_PRESETS,
  FOREGROUND_APPS,
  INITIAL_STATS,
  MAGNETS,
  SCANNABLE_DEVICES,
  type Device,
  type ForegroundApp,
  type Preset,
  type Stats,
} from './airmic-data'
import type { HotkeyMagnet } from './hotkey'

/**
 * AirMic 原型共享状态
 * ------------------------------------------------------------
 * 电脑端面板和手机端是同一份状态的两个视图 —— 原型里没有真实 IPC，
 * 用一个 Provider 把「前台应用 → 预案切换 → 磁贴内容变化」这条链路打通。
 *
 * 需求说明书 §4.3：电脑端检测到前台应用变化 → 查该应用绑定的预案 →
 * 绑了就切过去，没绑就切默认预案 → 手机端顶部出一条细状态条。
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
  /** 黑 Hole 之类的虚拟设备，标注出来 */
  virtual?: boolean
}

export const OUTPUT_DEVICES: AudioOutputDevice[] = [
  { id: 'blackhole-2ch', name: 'BlackHole 2ch', virtual: true },
  { id: 'blackhole-16ch', name: 'BlackHole 16ch', virtual: true },
  { id: 'macbook-speakers', name: 'MacBook Pro 扬声器' },
  { id: 'macbook-mic', name: 'MacBook Pro 麦克风' },
]

export type AirmicStore = {
  /* --- 连接 --- */
  paired: boolean
  pairedDevice: Device | null
  /** 电脑端记住的（已配对）设备 —— 点击可直接连上，不需要再请求同意 */
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
  /** 电脑端当前的配对码（可以被刷新成一个新码） */
  pairCode: string

  /* --- 手机端 --- */
  micMode: MicMode
  /** 快捷键磁铁库（全局，跨预案复用） */
  magnets: HotkeyMagnet[]
  presets: Preset[]
  activePresetId: string
  presetNotice: PresetNotice | null

  /* --- 动作 --- */
  startScan: () => void
  requestPair: (deviceId: string) => void
  approvePairing: () => void
  rejectPairing: () => void
  pairByCode: (code: string) => { ok: boolean; message: string }
  /** 换一个新的配对码 —— 旧码立刻失效 */
  refreshPairCode: () => void
  /** 已配对设备：点一下直接连上 */
  connectTo: (deviceId: string) => void
  /** 电脑端删除某台设备的配对信息 —— 删掉后手机端必须重新配对 */
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
}

const AirmicContext = createContext<AirmicStore | null>(null)

/** 配对码：6 位数字。原型里用固定码，方便演示时对照 */
export const DEMO_PAIR_CODE = '482916'

/** 生成一个新的 6 位配对码（不会和当前这个重复） */
function nextPairCode(current: string): string {
  let code = current
  while (code === current) {
    code = String(Math.floor(100000 + Math.random() * 900000))
  }
  return code
}

export function AirmicProvider({ children }: { children: ReactNode }) {
  const [paired, setPaired] = useState(true)
  const [pairedDevice, setPairedDevice] = useState<Device | null>(
    SCANNABLE_DEVICES[0] ?? null,
  )
  /** 电脑端记住的设备。删掉一条，这台手机下次就必须重新走配对流程。 */
  const [knownDevices, setKnownDevices] = useState<Device[]>(() =>
    SCANNABLE_DEVICES.filter((d) => d.paired),
  )
  const [devices, setDevices] = useState<Device[]>(SCANNABLE_DEVICES)
  const [scanning, setScanning] = useState(false)
  const [pairingRequest, setPairingRequest] = useState<PairingRequest | null>(null)

  const [foregroundApp, setForegroundAppState] = useState<ForegroundApp>(
    FOREGROUND_APPS[0],
  )
  const [serverRunning, setServerRunning] = useState(true)
  const [outputDeviceId, setOutputDeviceId] = useState(OUTPUT_DEVICES[0].id)
  const [stats] = useState<Stats>(INITIAL_STATS)
  const [bufferMs, setBufferMsState] = useState(INITIAL_STATS.bufferMs)
  const [testToneOn, setTestToneOn] = useState(false)

  const [micMode, setMicMode] = useState<MicMode>('idle')
  const [pairCode, setPairCode] = useState(DEMO_PAIR_CODE)
  const [magnets, setMagnets] = useState<HotkeyMagnet[]>(MAGNETS)
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS)
  const [activePresetId, setActivePresetId] = useState<string>(
    DEFAULT_PRESETS[0].id,
  )
  const [presetNotice, setPresetNotice] = useState<PresetNotice | null>(null)
  const noticeSeq = useRef(0)

  /* ---------- 预案自动切换 ---------- */
  /**
   * 需求说明书 §4.3：
   *   前台应用变了 → 该应用绑定了预案就切过去，没绑定就回落到默认预案。
   *   切换不中断正在进行的收音（这里只改 activePresetId，不碰 micMode）。
   *
   * 提示是**常驻**的（用户要求：切换电脑端应用时手机端常驻显示当前预案），
   * seq 用来让界面重放一次强调动画，提示本身不自动消失。
   */
  const applyPresetForApp = useCallback(
    (appName: string) => {
      const bound = presets.find((p) => p.appName === appName)
      const fallback = presets.find((p) => p.isDefault)
      const next = bound ?? fallback
      if (!next) return

      setActivePresetId((current) => {
        if (current === next.id) return current
        noticeSeq.current += 1
        setPresetNotice({
          seq: noticeSeq.current,
          name: next.name,
          fallback: !bound,
          appName,
        })
        return next.id
      })
    },
    [presets],
  )

  const setForegroundApp = useCallback(
    (appName: string) => {
      const app = FOREGROUND_APPS.find((a) => a.name === appName)
      if (!app) return
      setForegroundAppState(app)
      applyPresetForApp(app.name)
    },
    [applyPresetForApp],
  )

  useEffect(() => {
    return () => {
      // 预留：后续接入真实连接时在这里清理心跳
    }
  }, [])

  /* ---------- 连接 / 配对 ---------- */

  const startScan = useCallback(() => {
    setScanning(true)
    // 原型里扫描一次就结束；不持续轮询（省电，用户明确要求）
    window.setTimeout(() => {
      setDevices(SCANNABLE_DEVICES)
      setScanning(false)
    }, 900)
  }, [])

  const requestPair = useCallback((deviceId: string) => {
    const device = SCANNABLE_DEVICES.find((d) => d.id === deviceId)
    if (!device) return
    setPairingRequest({
      deviceId: device.id,
      deviceName: device.name,
      model: device.model,
    })
  }, [])

  const approvePairing = useCallback(() => {
    setPairingRequest((req) => {
      if (!req) return null
      const device =
        devices.find((d) => d.id === req.deviceId) ??
        SCANNABLE_DEVICES.find((d) => d.id === req.deviceId) ??
        null
      if (device) {
        const pairedOne = { ...device, paired: true }
        setPairedDevice(pairedOne)
        setKnownDevices((list) =>
          list.some((d) => d.id === pairedOne.id)
            ? list.map((d) => (d.id === pairedOne.id ? pairedOne : d))
            : [...list, pairedOne],
        )
        setDevices((list) =>
          list.map((d) => (d.id === device.id ? { ...d, paired: true } : d)),
        )
      }
      setPaired(true)
      return null
    })
  }, [devices])

  const rejectPairing = useCallback(() => setPairingRequest(null), [])

  /**
   * 已配对设备：点一下直接连上，不需要再请求同意。
   * 只有「电脑端删掉了这台设备的配对信息」之后，才需要重新走配对流程。
   */
  const connectTo = useCallback(
    (deviceId: string) => {
      const known = knownDevices.find((d) => d.id === deviceId)
      if (!known) {
        // 电脑端已经不记得这台设备了 → 走配对流程
        requestPair(deviceId)
        return
      }
      setPairedDevice(known)
      setPaired(true)
      setMicMode('idle')
    },
    [knownDevices, requestPair],
  )

  /** 电脑端删除配对信息 */
  const unpairDevice = useCallback((deviceId: string) => {
    setKnownDevices((list) => list.filter((d) => d.id !== deviceId))
    setDevices((list) => list.map((d) => (d.id === deviceId ? { ...d, paired: false } : d)))
    setPairedDevice((current) => {
      if (current?.id !== deviceId) return current
      setPaired(false)
      setMicMode('idle')
      return null
    })
  }, [])

  /**
   * 换一个配对码。旧码立刻失效 —— 手机端拿旧码来会收到
   * 「配对码已过期，在电脑端重新生成一个」。
   */
  const refreshPairCode = useCallback(() => {
    setPairCode((current) => nextPairCode(current))
  }, [])

  const pairByCode = useCallback(
    (code: string) => {
      const trimmed = code.trim()
      if (trimmed.length !== 6) {
        return { ok: false, message: '配对码是 6 位数字，再数一遍' }
      }
      if (!/^\d{6}$/.test(trimmed)) {
        return { ok: false, message: '配对码只能有数字，重新输入' }
      }
      if (trimmed !== pairCode) {
        return { ok: false, message: '配对码已过期，在电脑端重新生成一个' }
      }
      const device = SCANNABLE_DEVICES[0]
      const pairedOne = { ...device, paired: true }
      setPairedDevice(pairedOne)
      // 配对码校验通过 = 电脑端也记住这台设备，之后点一下就能直连
      setKnownDevices((list) =>
        list.some((d) => d.id === pairedOne.id) ? list : [...list, pairedOne],
      )
      setDevices((list) =>
        list.map((d) => (d.id === device.id ? { ...d, paired: true } : d)),
      )
      setPaired(true)
      return { ok: true, message: `已连接 ${device.name}` }
    },
    [pairCode],
  )

  const disconnect = useCallback(() => {
    setPaired(false)
    setMicMode('idle')
  }, [])

  const unpair = useCallback(() => {
    setPaired(false)
    setPairedDevice(null)
    setMicMode('idle')
    setKnownDevices([])
    setDevices((list) => list.map((d) => ({ ...d, paired: false })))
  }, [])

  /* ---------- 电脑端 ---------- */

  const toggleServer = useCallback(() => setServerRunning((v) => !v), [])
  const setOutputDevice = useCallback((id: string) => setOutputDeviceId(id), [])
  const setBufferMs = useCallback((ms: number) => setBufferMsState(ms), [])
  const toggleTestTone = useCallback(() => setTestToneOn((v) => !v), [])

  /* ---------- 麦克风按钮双语义 ---------- */

  const toggleContinuous = useCallback(() => {
    setMicMode((m) => {
      if (m === 'ptt') return m
      return m === 'continuous' ? 'idle' : 'continuous'
    })
  }, [])

  const startPushToTalk = useCallback(() => setMicMode('ptt'), [])
  const endPushToTalk = useCallback(() => {
    setMicMode((m) => (m === 'ptt' ? 'idle' : m))
  }, [])

  /* ---------- 预案管理 ---------- */

  const createPreset = useCallback((name: string) => {
    const id = `p-${Date.now().toString(36)}`
    setPresets((list) => [
      ...list,
      {
        id,
        name: name.trim() || '新预案',
        appName: null,
        micPressId: null,
        micReleaseId: null,
        tiles: [],
      },
    ])
  }, [])

  const updatePreset = useCallback((id: string, patch: Partial<Preset>) => {
    setPresets((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    )
  }, [])

  const deletePreset = useCallback((id: string) => {
    setPresets((list) => {
      const target = list.find((p) => p.id === id)
      // 默认预案不能删
      if (!target || target.isDefault) return list
      const next = list.filter((p) => p.id !== id)
      setActivePresetId((current) => {
        if (current !== id) return current
        const fallback = next.find((p) => p.isDefault)
        return fallback ? fallback.id : next[0]?.id ?? current
      })
      return next
    })
  }, [])

  /* ---------- 磁铁管理 ---------- */

  const addMagnet = useCallback(
    (magnet: Omit<HotkeyMagnet, 'id'>) => {
      const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      setMagnets((list) => [...list, { ...magnet, id }])
      return id
    },
    [],
  )

  const updateMagnet = useCallback((id: string, patch: Partial<HotkeyMagnet>) => {
    setMagnets((list) =>
      list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    )
  }, [])

  /** 删磁铁要把所有预案里的引用一起清掉，否则磁贴会指向不存在的磁铁 */
  const deleteMagnet = useCallback((id: string) => {
    setMagnets((list) => list.filter((m) => m.id !== id))
    setPresets((list) =>
      list.map((p) => ({
        ...p,
        micPressId: p.micPressId === id ? null : p.micPressId,
        micReleaseId: p.micReleaseId === id ? null : p.micReleaseId,
        tiles: p.tiles.filter((t) => t.magnetId !== id),
      })),
    )
  }, [])

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
