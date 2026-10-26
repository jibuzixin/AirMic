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
  type MagnetGroup,
  type Preset,
  type Stats,
} from './airmic-data'
import { EMPTY_STATS } from './airmic-data'
import { magnetAction, type HotkeyMagnet, type MagnetAction } from './hotkey'
import { vibrate, type HapticKind, type HapticStrength } from './haptics'
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
  /** 静默多少秒自动关麦（0 = 关） */
  silenceSeconds: number
  /** 后台闲置多少分钟后允许断开连接（0 = 不断开） */
  linkIdleMinutes: number
  /** 磁片组 */
  groups: MagnetGroup[]
  /** 震动反馈开关 */
  hapticsEnabled: boolean
  /** 震动强度 */
  hapticStrength: HapticStrength
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
    silenceSeconds: 30,
    linkIdleMinutes: 60,
    groups: [],
    hapticsEnabled: true,
    hapticStrength: 'normal',
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
          return {
            ...preset,
            appIds,
            micHoldId: preset.micHoldId ?? null,
            micHoldGroupId: preset.micHoldGroupId ?? null,
          }
        },
      ),
      appList: parsed.appList ?? [],
      deviceHost: parsed.deviceHost ?? null,
      devicePort: parsed.devicePort ?? null,
      theme: parsed.theme ?? 'system',
      // 旧版本的默认值是 10s；用户没改过的升级成新的默认 30s
      silenceSeconds:
        parsed.silenceSeconds === 10
          ? 30
          : typeof parsed.silenceSeconds === 'number'
            ? parsed.silenceSeconds
            : 30,
      linkIdleMinutes:
        parsed.linkIdleMinutes === 0 ||
        parsed.linkIdleMinutes === 30 ||
        parsed.linkIdleMinutes === 60 ||
        parsed.linkIdleMinutes === 120
          ? parsed.linkIdleMinutes
          : 60,
      groups: parsed.groups ?? [],
      hapticsEnabled: parsed.hapticsEnabled !== false,
      hapticStrength: parsed.hapticStrength === 'light' ? 'light' : 'normal',
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
  /** 是否真正连着电脑（不是「配对过」） */
  connected: boolean
  /** 电脑端的收音是用户手动关的吗（false = 静默自动关） */
  serverStoppedByUser: boolean
  /** 是否需要提醒「电脑端没有在收音」 */
  shouldWarnServerIdle: boolean
  /** 静默自动关麦（秒，0 = 关） */
  silenceSeconds: number
  /** 后台闲置多少分钟后允许断开连接（0 = 不断开） */
  linkIdleMinutes: number
  /** 静默自动关麦的提示 */
  micAutoStopNotice: string | null
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

  /* --- 磁片 --- */
  addMagnet: (magnet: Omit<HotkeyMagnet, 'id'>) => string
  updateMagnet: (id: string, patch: Partial<HotkeyMagnet>) => void
  deleteMagnet: (id: string) => void

  /* --- 磁片组 --- */
  groups: MagnetGroup[]
  addGroup: (name: string) => string
  updateGroup: (id: string, patch: Partial<MagnetGroup>) => void
  deleteGroup: (id: string) => void
  /** 新建或整体替换一个磁片组 */
  upsertGroup: (group: MagnetGroup) => void
  /** 依次执行组里的磁片（每步间隔 group.intervalSeconds） */
  runGroup: (group: MagnetGroup) => void
  /** 当前正在执行的组（用于界面提示） */
  runningGroupId: string | null

  dismissMicBlocked: () => void

  /* --- 快捷键 --- */
  /** 点磁贴：让电脑执行这个磁片的组合键（按下+抬起） */
  fireMagnet: (magnet: HotkeyMagnet) => void
  /** 长按磁贴：按下组合键并保持 */
  holdTileMagnet: (magnet: HotkeyMagnet) => void
  /** 长按磁贴松手：松开组合键 */
  releaseTileMagnet: () => void
  dismissRemoteError: () => void

  /* --- 预案绑定的应用 --- */
  /** 拉取电脑端记录过的所有应用（覆盖本地缓存） */
  fetchAppList: () => void
  /** 取电脑当前的前台应用（不保存） */
  fetchCurrentApp: () => void

  /* --- 外观 --- */
  setThemeMode: (mode: ThemeMode) => void

  /* --- 省电 / 连接 --- */
  /** 静默多少秒自动关麦（0 = 关） */
  setSilenceSeconds: (seconds: number) => void
  setLinkIdleMinutes: (minutes: number) => void
  dismissMicAutoStop: () => void
  /** 主动重连（回到前台 / 断线时用） */
  reconnect: () => void

  /* --- 震动 --- */
  hapticsEnabled: boolean
  hapticStrength: HapticStrength
  setHapticsEnabled: (enabled: boolean) => void
  setHapticStrength: (strength: HapticStrength) => void
  /** 震一下（受开关控制） */
  haptic: (kind?: HapticKind) => void
}

const AirmicContext = createContext<AirmicStore | null>(null)

export function AirmicProvider({ children }: { children: ReactNode }) {
  const persisted = useRef(loadPersisted()).current
  const transport = useRef<AirMicTransport>(createTransport()).current

  // 有 token 就先当作已配对：启动直接进麦克风页，连上之后再确认，
  // 避免「回到 App 先看到设备页、还要重新扫描」
  const [paired, setPaired] = useState<boolean>(() => !!persisted.token)
  const [pairedDevice, setPairedDevice] = useState<Device | null>(() =>
    persisted.token
      ? {
          id: persisted.deviceId ?? 'saved',
          name: persisted.deviceName ?? '电脑',
          model: '',
          signal: 4,
          paired: true,
          lastSeen: Date.now(),
        }
      : null,
  )
  /** 真正的连接状态（paired 只是「配对过」） */
  const [connected, setConnected] = useState(false)
  /** 电脑端的收音是用户手动关的吗（false = 静默自动关） */
  const [serverStoppedByUser, setServerStoppedByUser] = useState(true)
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
  /** 静默自动关麦（秒，0 = 关） */
  const [silenceSeconds, setSilenceSecondsState] = useState<number>(
    persisted.silenceSeconds ?? 30,
  )
  /** 后台闲置多久后允许断开（分钟，0 = 不断开） */
  const [linkIdleMinutes, setLinkIdleMinutesState] = useState<number>(
    persisted.linkIdleMinutes ?? 60,
  )
  /** 静默自动关麦的提示 */
  const [micAutoStopNotice, setMicAutoStopNotice] = useState<string | null>(null)
  /** 磁片组（组内磁片按顺序执行） */
  const [groups, setGroups] = useState<MagnetGroup[]>(persisted.groups ?? [])
  /** 震动反馈 */
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(
    persisted.hapticsEnabled ?? true,
  )
  const [hapticStrength, setHapticStrengthState] = useState<HapticStrength>(
    persisted.hapticStrength ?? 'normal',
  )
  /** 外观模式 */
  const [themeMode, setThemeModeState] = useState<ThemeMode>(persisted.theme ?? 'system')
  /** 系统栏高度（页面铺满全屏，自己留边距） */
  const [insets, setInsets] = useState({ top: 0, bottom: 0 })
  /** 长按说话时按下的组合键（松开时要还原） */
  const heldComboRef = useRef<string[] | null>(null)
  /**
   * 长按绑定的是磁片组时，松手后还要依次执行的步骤。
   *
   * 步骤有两种：按键（hotkey.execute）和文本（text.paste）。
   * 组里第一个有组合键的步骤是「按住不放」的那个，它前面的文本在按下时粘贴，
   * 它后面的步骤在松手后依次执行 —— 这样组的先后顺序不会乱。
   */
  const heldGroupStepsRef = useRef<{
    steps: MagnetAction[]
    intervalMs: number
  } | null>(null)
  const holdReleaseTimers = useRef<number[]>([])
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
        silenceSeconds,
        linkIdleMinutes,
        groups,
        hapticsEnabled,
        hapticStrength,
        ...patch,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* 存不下就算了，不影响本次会话 */
      }
      // 同步更新内存快照：首次配对 / 连接后，reconnect() 立刻就能拿到
      // token 和 host，不用等下次冷启动。
      Object.assign(persisted, next)
    },
    [
      appList,
      groups,
      hapticStrength,
      hapticsEnabled,
      linkIdleMinutes,
      magnets,
      persisted,
      presets,
      silenceSeconds,
      themeMode,
    ],
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

  /** 最后一次检测到有效声音的时间（静默检测用） */
  const lastLoudAtRef = useRef(Date.now())
  /** 退到后台的时间（用来判断是不是真的熄屏了一阵） */
  const backgroundedAtRef = useRef<number | null>(null)
  /** 原生事件回调里读取最新状态，避免闭包过期 */
  const micModeRef = useRef(micMode)
  const pairedRef = useRef(paired)
  const connectedRef = useRef(connected)
  useEffect(() => {
    micModeRef.current = micMode
  }, [micMode])
  useEffect(() => {
    pairedRef.current = paired
  }, [paired])
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  /** 防止重连轮询和启动连接同时打两次 */
  const connectInFlightRef = useRef(false)
  /** 上一次发起连接的时间：给 welcome 留出到达时间，避免重复连 */
  const lastConnectAtRef = useRef(0)
  /** 上一次连接是不是失败了 —— 失败后优先重新扫 mDNS，拿新地址 */
  const lastConnectFailedRef = useRef(false)
  /** 上一次重新扫描的时间（节流） */
  const lastDiscoveryAtRef = useRef(0)

  /** 主动重连（回到前台、连接断开时用） */
  const reconnect = useCallback(() => {
    if (!persisted.token || !persisted.deviceHost) return
    if (connectInFlightRef.current) return
    connectInFlightRef.current = true
    lastConnectAtRef.current = Date.now()
    lastConnectFailedRef.current = false
    void transport
      .connect({
        deviceId: persisted.deviceId ?? 'saved',
        host: persisted.deviceHost,
        port: persisted.devicePort ?? 47471,
        token: persisted.token,
      })
      .catch((error: Error) => {
        lastConnectFailedRef.current = true
        setConnectionError(error.message || '连不上电脑，确认电脑端还在运行')
      })
      .finally(() => {
        connectInFlightRef.current = false
      })
  }, [persisted, transport])

  /**
   * 重新在局域网里找一次这台电脑。
   *
   * 电脑休眠 / DHCP 续租后 IP 可能变了，之前保存的 host 就连不上；
   * 手动「换设备」能连上，正是因为它重新扫了 mDNS。自动重连失败几次后
   * 也走一遍扫描，把地址更新掉再连。
   */
  const rediscover = useCallback(async (): Promise<boolean> => {
    const now = Date.now()
    if (now - lastDiscoveryAtRef.current < 10000) return false
    lastDiscoveryAtRef.current = now
    try {
      const list = await transport.scan()
      const target =
        list.find((d) => d.id === persisted.deviceId) ??
        list.find((d) => d.name === persisted.deviceName) ??
        (list.length === 1 ? list[0] : null)
      if (!target?.host) return false
      persist({
        deviceId: target.id,
        deviceName: target.name,
        deviceHost: target.host,
        devicePort: target.port ?? 47471,
      })
      setPairedDevice(target)
      return true
    } catch {
      return false
    }
  }, [persist, persisted.deviceId, persisted.deviceName, transport])

  const rediscoverRef = useRef(rediscover)
  useEffect(() => {
    rediscoverRef.current = rediscover
  }, [rediscover])

  /** 电脑端是否支持手机主动 ping（老版本没有这个能力，别因此误判断线） */
  const serverSupportsPingRef = useRef(false)

  /** 回到前台时发一次 ping/pong：连着就无感继续用，真断了再重连 */
  const healthPingRef = useRef<{ t: number; timer: number } | null>(null)
  const clearHealthCheck = useCallback(() => {
    if (healthPingRef.current) {
      window.clearTimeout(healthPingRef.current.timer)
      healthPingRef.current = null
    }
  }, [])
  const healthCheck = useCallback(() => {
    clearHealthCheck()
    const t = Date.now()
    const timer = window.setTimeout(() => {
      healthPingRef.current = null
      if (!connectedRef.current) return
      // ping 没回来：这条连接已经不能用了
      connectedRef.current = false
      lastConnectFailedRef.current = true
      setConnected(false)
      if (micModeRef.current !== 'idle') {
        setMicMode('idle')
        void transport.stopMic()
      }
    }, 2000)
    healthPingRef.current = { t, timer }
    send({ type: 'ping', t })
  }, [clearHealthCheck, send, transport])

  /**
   * 回到前台：
   * - 离开超过 2 秒、且没在收音 → 强制重建连接（旧 socket 可能已经僵死）
   * - 离开时间很短 → 不动，避免切一下通知栏就断开
   */
  useEffect(() => {
    return transport.onAppStateChange((active) => {
      if (!active) {
        backgroundedAtRef.current = Date.now()
        return
      }
      const away = backgroundedAtRef.current
        ? Date.now() - backgroundedAtRef.current
        : 0
      backgroundedAtRef.current = null
      if (
        away > 2000 &&
        pairedRef.current &&
        persisted.token &&
        micModeRef.current === 'idle'
      ) {
        if (connectedRef.current && serverSupportsPingRef.current) {
          // 连接还在：发一个 ping 验证，不主动断开 —— 用户回来立刻能用
          healthCheck()
        } else if (!connectedRef.current) {
          // 已经断了：重新扫一次地址再连
          void rediscoverRef.current().then((updated) => {
            if (
              updated &&
              !backgroundedAtRef.current &&
              !connectedRef.current &&
              !connectInFlightRef.current
            ) {
              reconnect()
            }
          })
        }
        // 连着但电脑端是老版本：不主动断，也不误判；靠原生连接状态
      }
    })
  }, [healthCheck, persisted.token, reconnect, transport])

  /**
   * 断线自动重连。
   *
   * 连接期间后台靠原生前台服务保活；这里只在断开时轮询。
   * 退避到 30 秒一次，避免电脑没开时一直打网络。
   * 不依赖 App 前后台状态 —— 那个事件在部分机型上可能漏掉，
   * 会导致「一直显示重新连接但永远不重试」。
   */
  useEffect(() => {
    if (connected || !paired) return
    if (!persisted.token || !persisted.deviceHost) return

    let cancelled = false
    let attempt = 0
    let timer: number | null = null
    const delays = [500, 1000, 2000, 5000, 10000, 20000, 30000]

    const tick = async () => {
      if (cancelled) return
      // 原生连接如果卡死，别让 in-flight 标记永远挡住重试
      if (
        connectInFlightRef.current &&
        Date.now() - lastConnectAtRef.current > 8000
      ) {
        connectInFlightRef.current = false
        setConnectionError('连接超时，正在重试')
      }
      if (
        !connectInFlightRef.current &&
        Date.now() - lastConnectAtRef.current > 1500
      ) {
        // 上次连不上 → 先重新扫一遍电脑地址，再连
        if (lastConnectFailedRef.current) {
          await rediscoverRef.current()
        }
        if (!cancelled && !connectInFlightRef.current) {
          reconnect()
        }
      }
      if (cancelled) return
      const delay = delays[Math.min(attempt, delays.length - 1)]
      attempt += 1
      timer = window.setTimeout(tick, delay)
    }

    timer = window.setTimeout(tick, 300)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [
    connected,
    paired,
    persisted.deviceHost,
    persisted.token,
    reconnect,
  ])

  const setHapticsEnabled = useCallback(
    (enabled: boolean) => {
      setHapticsEnabledState(enabled)
      persist({ hapticsEnabled: enabled })
    },
    [persist],
  )

  const setHapticStrength = useCallback(
    (strength: HapticStrength) => {
      setHapticStrengthState(strength)
      persist({ hapticStrength: strength })
    },
    [persist],
  )

  const haptic = useCallback(
    (kind: HapticKind = 'tap') => {
      if (!hapticsEnabled) return
      vibrate(kind, hapticStrength)
    },
    [hapticStrength, hapticsEnabled],
  )

  const setSilenceSeconds = useCallback(
    (seconds: number) => {
      const value = Math.max(0, Math.min(600, seconds))
      setSilenceSecondsState(value)
      persist({ silenceSeconds: value })
    },
    [persist],
  )

  const setLinkIdleMinutes = useCallback(
    (minutes: number) => {
      const value = [0, 30, 60, 120].includes(minutes) ? minutes : 60
      setLinkIdleMinutesState(value)
      persist({ linkIdleMinutes: value })
    },
    [persist],
  )

  /** 把保活设置同步给原生层（原生会持久化一份） */
  useEffect(() => {
    void transport.setLinkIdleMinutes(linkIdleMinutes).catch(() => {
      /* 老版本原生插件没有这个方法时忽略 */
    })
  }, [linkIdleMinutes, transport])

  const dismissMicAutoStop = useCallback(() => setMicAutoStopNotice(null), [])

  /* ---------- 启动时自动连上上次的电脑 ---------- */
  //
  // 需求：配对一次成功后，下次打开**直接进麦克风页**，不用再点一遍。
  useEffect(() => {
    if (!persisted.token || !persisted.deviceHost) return
    reconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 老版本只存了 token、没存地址 → 回设备页重新选一次，别卡在重连横幅上 */
  useEffect(() => {
    if (paired && persisted.token && !persisted.deviceHost) {
      setPaired(false)
    }
  }, [paired, persisted.deviceHost, persisted.token])

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
    const offMessage = transport.onMessage((message) => {
      switch (message.type) {
        case 'welcome': {
          const required = message.pairingRequired === true
          serverSupportsPingRef.current =
            Array.isArray(message.features) && message.features.includes('ping')
          setPaired(!required)
          if (!required) {
            setConnected(true)
            setConnectionError(null)
            clearHealthCheck()
          }
          // 需要配对、而且是用户刚点了这台设备 → 这时候才发配对请求
          if (required && pairingDevice) {
            setPairingRequest({
              deviceId: pairingDevice.id,
              deviceName: pairingDevice.name,
              model: pairingDevice.model,
            })
            send({
              type: 'pair.request',
              deviceId: deviceInfo.deviceId,
              deviceName: deviceInfo.deviceName || pairingDevice.name,
              model: deviceInfo.deviceName,
            })
          }
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
            persist({
              token: message.token,
              // 把地址一起存下来：配对后就能直接自动重连
              deviceId: pairingDevice?.id ?? persisted.deviceId,
              deviceName: pairingDevice?.name ?? persisted.deviceName,
              deviceHost: pairingDevice?.host ?? persisted.deviceHost,
              devicePort: pairingDevice?.port ?? persisted.devicePort,
            })
            // 原生侧也存一份，重连时自动带上
            void transport.saveToken(deviceInfo.deviceId, message.token)
          } else {
            setPairingRequest(null)
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
        case 'pong':
          // 回到前台时主动 ping 的回包
          if (
            healthPingRef.current &&
            (typeof message.t !== 'number' ||
              message.t === healthPingRef.current.t)
          ) {
            clearHealthCheck()
          }
          break
        case 'mic.state':
          setServerRunning(message.mode !== 'idle')
          break
        default:
          break
      }
    })

    const offLevel = transport.onLevel((level) => {
      setMicLevel(level)
      if (level > 0.02) lastLoudAtRef.current = Date.now()
    })

    const offConnection = transport.onConnection((state) => {
      setConnected(state.connected)
      if (state.connected) {
        setConnectionError(null)
        clearHealthCheck()
        return
      }
      if (state.error) setConnectionError(state.error)
      clearHealthCheck()

      // ⚠️ 断线不再退回设备页 —— 用户熄屏几分钟回来，应该还在麦克风页，
      // 由上面的重连 effect 自动续上。只有用户主动断开 / 配对失效才回设备页。
      // 真的断线时把收音停掉：声音已经传不过去了。
      if (micModeRef.current !== 'idle') {
        setMicMode('idle')
        setMicLevel(0)
        void transport.stopMic()
      }
    })

    return () => {
      offMessage()
      offLevel()
      offConnection()
    }
  }, [
    bufferMs,
    clearHealthCheck,
    deviceInfo.deviceId,
    devices,
    pairedDevice,
    pairingDevice,
    persist,
    persisted.deviceId,
    persisted.deviceName,
    persisted.token,
    transport,
  ])

  const applyServerState = useCallback((server: any) => {
    // serverRunning = 电脑端当前有没有在收音（手机据此提示「声音传不过去」）
    if (typeof server.recording === 'boolean') setServerRunning(server.recording)
    if (typeof server.stoppedByUser === 'boolean') {
      setServerStoppedByUser(server.stoppedByUser)
    }
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
      setConnected(false)
    }
  }, [pairedDevice])

  const disconnect = useCallback(() => {
    void transport.disconnect()
    setConnected(false)
    setPaired(false)
    setMicMode('idle')
  }, [transport])

  const unpair = useCallback(() => {
    void transport.disconnect()
    setConnected(false)
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
      // 没连上就别启动采集：否则原生会拿旧地址启动服务，
      // 轻则录了个寂寞，重则在前台服务切换时闪退。
      if (!connected) {
        setMicBlockedNotice('正在连接电脑，稍等一下')
        return false
      }
      // 没有麦克风权限就别硬来 —— 直接告诉用户要开哪个权限
      let granted = false
      try {
        granted = await transport.hasMicPermission()
        if (!granted) {
          granted = await transport.requestMicPermission()
        }
      } catch {
        setMicBlockedNotice('检查麦克风权限失败，请再试一次')
        return false
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
    [connected, send, transport],
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
  /** 需不需要提醒「电脑端没有在收音」：只有用户手动关掉时才提醒 */
  const shouldWarnServerIdle = !serverRunning && serverStoppedByUser

  const warnIfServerIdle = useCallback(() => {
    if (serverRunning || !serverStoppedByUser) return
    setMicBlockedNotice('电脑端没有在收音，声音传不过去')
    if (hapticsEnabled) vibrate('warn', hapticStrength)
  }, [hapticStrength, hapticsEnabled, serverRunning, serverStoppedByUser])

  /**
   * 当前预案里麦克风按钮绑定的磁片
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
   * 长按绑定：磁片或磁片组（二选一）
   *
   * 磁片组的长按语义：第一步跟着手指按住，松手后剩下的步骤依次执行。
   */
  const presetHoldBinding = useCallback((): {
    magnet: HotkeyMagnet | null
    group: MagnetGroup | null
  } => {
    const preset = presets.find((p) => p.id === activePresetId)
    if (!preset) return { magnet: null, group: null }
    if (preset.micHoldGroupId) {
      const group = groups.find((g) => g.id === preset.micHoldGroupId)
      if (group) return { magnet: null, group }
    }
    return {
      magnet: magnets.find((m) => m.id === preset.micHoldId) ?? null,
      group: null,
    }
  }, [activePresetId, groups, magnets, presets])

  /** 把解析好的动作发给电脑 */
  const sendAction = useCallback(
    (action: MagnetAction) => {
      if (action.kind === 'text') {
        send({ type: 'text.paste', text: action.text })
      } else {
        send({ type: 'hotkey.execute', combo: action.combo })
      }
    },
    [send],
  )

  /**
   * 点按语义：开 / 关各触发一次（按下 → 抬起）
   */
  const fireTap = useCallback(
    (magnet: HotkeyMagnet | null) => {
      const action = magnetAction(magnet)
      if (action) sendAction(action)
    },
    [sendAction],
  )

  const toggleContinuous = useCallback(() => {
    if (micMode === 'ptt') return
    if (micMode === 'continuous') {
      stopCapture()
      // 关闭麦克风 → 触发「松开」磁片
      fireTap(presetMagnet('release'))
      setMicMode('idle')
      return
    }
    if (!connected) {
      setMicBlockedNotice('正在连接电脑，稍等一下')
      reconnect()
      return
    }
    warnIfServerIdle()
    lastLoudAtRef.current = Date.now()
    setMicMode('continuous')
    // 采集真正起来之后再触发「按下」磁片；失败就回滚，别让界面假装在收音
    void beginCapture('continuous').then((ok) => {
      if (ok) {
        fireTap(presetMagnet('press'))
      } else {
        setMicMode('idle')
      }
    })
  }, [
    beginCapture,
    connected,
    fireTap,
    micMode,
    presetMagnet,
    reconnect,
    stopCapture,
    warnIfServerIdle,
  ])

  const startPushToTalk = useCallback(() => {
    if (micMode === 'ptt') return
    if (!connected) {
      setMicBlockedNotice('正在连接电脑，稍等一下')
      reconnect()
      return
    }
    warnIfServerIdle()
    // 长按语义：按下组合键但**不松开**，等手指抬起来才还原
    // 用的是「长按」自己绑定的磁片 / 磁片组，与「按下 / 松开」互相独立
    const binding = presetHoldBinding()
    if (binding.group) {
      /*
       * 组：找出第一个**有组合键**的步骤 —— 那个是「按住不放」的。
       *
       * ⚠️ 文本磁片没法按住（没有键能一直按着），所以：
       *   - 它排在按住的那一步**之前** → 按下时立刻粘贴出来
       *   - 它排在**之后** → 松手后跟着其它步骤一起依次执行
       * 这样组内的先后顺序不会被打乱。
       */
      const actions = binding.group.steps
        .map((magnetId) => magnets.find((m) => m.id === magnetId))
        .map(magnetAction)
        .filter((action): action is MagnetAction => action !== null)

      const holdIndex = actions.findIndex((action) => action.kind === 'key')
      if (holdIndex === -1) {
        // 全是文本磁片：没有能按住的那一步，按下后按组间隔依次粘贴
        let delay = 0
        for (const action of actions) {
          if (delay === 0) {
            sendAction(action)
          } else {
            holdReleaseTimers.current.push(
              window.setTimeout(() => sendAction(action), delay),
            )
          }
          delay += Math.max(0, binding.group.intervalSeconds) * 1000
        }
      } else {
        // 按住之前的那几步（只能是文本）先粘贴出来
        actions.slice(0, holdIndex).forEach(sendAction)
        const held = actions[holdIndex]
        if (held.kind === 'key') {
          heldComboRef.current = held.combo
          send({ type: 'hotkey.down', combo: held.combo })
        }
        heldGroupStepsRef.current = {
          steps: actions.slice(holdIndex + 1),
          intervalMs: Math.max(0, binding.group.intervalSeconds) * 1000,
        }
      }
    } else if (binding.magnet) {
      const action = magnetAction(binding.magnet)
      if (action?.kind === 'text') {
        // 文本磁片没有「按住」语义，按下就粘贴
        sendAction(action)
      } else if (action?.kind === 'key') {
        heldComboRef.current = action.combo
        send({ type: 'hotkey.down', combo: action.combo })
      }
    }
    setMicMode('ptt')
    void beginCapture('ptt').then((ok) => {
      if (ok) return
      // 采集没起来：把可能已经按住的键松开，界面回到待机
      setMicMode('idle')
      if (heldComboRef.current) {
        send({ type: 'hotkey.up', combo: heldComboRef.current })
        heldComboRef.current = null
      }
      heldGroupStepsRef.current = null
    })
  }, [
    beginCapture,
    connected,
    magnets,
    micMode,
    presetHoldBinding,
    reconnect,
    send,
    sendAction,
    warnIfServerIdle,
  ])

  const endPushToTalk = useCallback(() => {
    // ⚠️ 不管当前状态是不是 ptt，只要按下过组合键就必须松开 ——
    // 否则电脑上的键会一直卡在「按住」状态（用户反馈的核心问题）。
    if (heldComboRef.current) {
      send({ type: 'hotkey.up', combo: heldComboRef.current })
      heldComboRef.current = null
    }
    // 长按绑定磁片组：松开第一步之后，先等一个组间隔，剩下的再依次执行
    const pending = heldGroupStepsRef.current
    heldGroupStepsRef.current = null
    if (pending && pending.steps.length > 0) {
      let delay = pending.intervalMs
      for (const action of pending.steps) {
        holdReleaseTimers.current.push(
          window.setTimeout(() => sendAction(action), delay),
        )
        delay += pending.intervalMs
      }
    }
    if (micMode === 'ptt') {
      setMicMode('idle')
      stopCapture()
    }
  }, [micMode, send, sendAction, stopCapture])

  /** 静默自动关麦 */
  useEffect(() => {
    if (micMode !== 'continuous' || silenceSeconds <= 0) return
    const timer = window.setInterval(() => {
      if (Date.now() - lastLoudAtRef.current >= silenceSeconds * 1000) {
        toggleContinuous()
        setMicAutoStopNotice(`静默 ${silenceSeconds} 秒，已自动关闭麦克风`)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [micMode, silenceSeconds, toggleContinuous])


  const dismissMicBlocked = useCallback(() => setMicBlockedNotice(null), [])
  const dismissRemoteError = useCallback(() => setRemoteError(null), [])

  /* ---------- 快捷键 ---------- */

  /** 长按磁贴记住的组合键 */
  const heldTileComboRef = useRef<string[] | null>(null)

  /**
   * 长按磁贴：按下组合键并保持
   *
   * ⚠️ 文本磁片没有键可以「按住」—— 长按它就是**粘贴这段文字**，
   * 和点按效果一样（松手时不会重复触发）。
   */
  const holdTileMagnet = useCallback(
    (magnet: HotkeyMagnet) => {
      const action = magnetAction(magnet)
      if (!action) return
      if (action.kind === 'text') {
        sendAction(action)
        return
      }
      heldTileComboRef.current = action.combo
      send({ type: 'hotkey.down', combo: action.combo })
    },
    [send, sendAction],
  )

  const releaseTileMagnet = useCallback(() => {
    const combo = heldTileComboRef.current
    if (!combo) return
    heldTileComboRef.current = null
    send({ type: 'hotkey.up', combo })
  }, [send])

  /** 点磁贴：把组合键发给电脑执行 */
  const fireMagnet = useCallback(
    (magnet: HotkeyMagnet) => {
      const action = magnetAction(magnet)
      if (action) sendAction(action)
    },
    [sendAction],
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
          micHoldId: null,
          micHoldGroupId: null,
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

  /* ---------- 磁片管理 ---------- */
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

  /** 删磁片要把所有预案里的引用一起清掉 */
  const deleteMagnet = useCallback(
    (id: string) => {
      const nextMagnets = magnets.filter((m) => m.id !== id)
      const nextPresets = presets.map((p) => ({
        ...p,
        micPressId: p.micPressId === id ? null : p.micPressId,
        micReleaseId: p.micReleaseId === id ? null : p.micReleaseId,
        micHoldId: p.micHoldId === id ? null : p.micHoldId,
        tiles: p.tiles.filter((t) => t.magnetId !== id),
      }))
      const nextGroups = groups.map((g) => ({
        ...g,
        steps: g.steps.filter((step) => step !== id),
      }))
      setMagnets(nextMagnets)
      setPresets(nextPresets)
      setGroups(nextGroups)
      persist({ magnets: nextMagnets, presets: nextPresets, groups: nextGroups })
      pushConfig(nextMagnets, nextPresets)
    },
    [groups, magnets, persist, presets, pushConfig],
  )

  /* ---------- 磁片组 ---------- */

  const [runningGroupId, setRunningGroupId] = useState<string | null>(null)
  const groupTimers = useRef<number[]>([])

  const addGroup = useCallback(
    (name: string) => {
      const id = `g-${Date.now().toString(36)}`
      const next = [
        ...groups,
        {
          id,
          name: name.trim() || '新磁片组',
          icon: 'Boxes',
          steps: [],
          intervalSeconds: 1,
        },
      ]
      setGroups(next)
      persist({ groups: next })
      return id
    },
    [groups, persist],
  )

  const updateGroup = useCallback(
    (id: string, patch: Partial<MagnetGroup>) => {
      const next = groups.map((g) => (g.id === id ? { ...g, ...patch } : g))
      setGroups(next)
      persist({ groups: next })
    },
    [groups, persist],
  )

  const upsertGroup = useCallback(
    (group: MagnetGroup) => {
      const exists = groups.some((g) => g.id === group.id)
      const next = exists
        ? groups.map((g) => (g.id === group.id ? group : g))
        : [...groups, group]
      setGroups(next)
      persist({ groups: next })
    },
    [groups, persist],
  )

  const deleteGroup = useCallback(
    (id: string) => {
      const nextGroups = groups.filter((g) => g.id !== id)
      // 预案里引用这个组的磁贴一起删掉；长按绑定也要解除
      const nextPresets = presets.map((p) => ({
        ...p,
        micHoldGroupId: p.micHoldGroupId === id ? null : p.micHoldGroupId,
        tiles: p.tiles.filter((t) => t.groupId !== id),
      }))
      setGroups(nextGroups)
      setPresets(nextPresets)
      persist({ groups: nextGroups, presets: nextPresets })
      pushConfig(magnets, nextPresets)
    },
    [groups, magnets, persist, presets, pushConfig],
  )

  const runGroup = useCallback(
    (group: MagnetGroup) => {
      groupTimers.current.forEach((timer) => window.clearTimeout(timer))
      groupTimers.current = []

      let delay = 0
      for (const magnetId of group.steps) {
        const magnet = magnets.find((m) => m.id === magnetId)
        const action = magnetAction(magnet)
        if (!action) continue
        groupTimers.current.push(
          window.setTimeout(() => sendAction(action), delay),
        )
        delay += Math.max(0, group.intervalSeconds) * 1000
      }

      if (groupTimers.current.length > 0) {
        setRunningGroupId(group.id)
        groupTimers.current.push(
          window.setTimeout(() => {
            setRunningGroupId(null)
            groupTimers.current = []
          }, delay + 300),
        )
      }
    },
    [magnets, sendAction],
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
      connected,
      serverStoppedByUser,
      shouldWarnServerIdle,
      silenceSeconds,
      linkIdleMinutes,
      micAutoStopNotice,
      themeMode,
      insets,
      connectionError,
      startScan,
      requestPair,
      approvePairing,
      rejectPairing,
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
      groups,
      addGroup,
      updateGroup,
      upsertGroup,
      deleteGroup,
      runGroup,
      runningGroupId,
      dismissMicBlocked,
      fireMagnet,
      holdTileMagnet,
      releaseTileMagnet,
      dismissRemoteError,
      fetchAppList,
      fetchCurrentApp,
      setThemeMode,
      setSilenceSeconds,
      setLinkIdleMinutes,
      dismissMicAutoStop,
      reconnect,
      hapticsEnabled,
      hapticStrength,
      setHapticsEnabled,
      setHapticStrength,
      haptic,
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
      connected,
      serverStoppedByUser,
      shouldWarnServerIdle,
      silenceSeconds,
      linkIdleMinutes,
      micAutoStopNotice,
      themeMode,
      insets,
      connectionError,
      startScan,
      requestPair,
      approvePairing,
      rejectPairing,
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
      groups,
      addGroup,
      updateGroup,
      upsertGroup,
      deleteGroup,
      runGroup,
      runningGroupId,
      dismissMicBlocked,
      fireMagnet,
      holdTileMagnet,
      releaseTileMagnet,
      dismissRemoteError,
      fetchAppList,
      fetchCurrentApp,
      setThemeMode,
      setSilenceSeconds,
      setLinkIdleMinutes,
      dismissMicAutoStop,
      reconnect,
      hapticsEnabled,
      hapticStrength,
      setHapticsEnabled,
      setHapticStrength,
      haptic,
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
