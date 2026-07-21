import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Arena3D,
  type ArenaBattleEvent as ArenaEvent,
} from './components/Arena3D'
import {
  analyzeImageFile,
  createPetManifest,
  type PetManifest,
} from './core/artifact'
import { lunaWorkerConfigured, requestLunaAnalysis } from './api/luna'
import {
  connectRoom,
  type RoomConnection,
  type RoomServerMessage,
} from './api/room'
import {
  actionBeats,
  createBattleState,
  resolveTurn,
  type BattleAction,
  type BattleEvent,
  type BattleState,
} from './core/battle'
import {
  LEVEL_PROFILES,
  awardBattleResult,
  completeEvolutionQuest,
  createInitialProgress,
  levelForXp,
  nextLevelProfile,
  parseStoredProgress,
  profileForLevel,
  xpProgress,
  type BattleReward,
  type PlayerProgress,
} from './core/progression'
import {
  buildSvgModel,
  evolutionFocusLabel,
  validateSvgText,
  type EvolutionFocus,
  type SvgModelArtifact,
} from './core/evolution'
import {
  initialLocale,
  initialTheme,
  translate,
  type Locale,
  type ThemeMode,
} from './i18n'
import './App.css'

type AppPhase = 'summon' | 'battle'
type BattleMode = 'local' | 'online'
type OnlineStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'waiting'
  | 'active'
  | 'action-locked'
  | 'disconnected'
  | 'error'

interface PetView {
  id: string
  name: string
  description: string
  imageUrl: string
  traits: string[]
  lockedTraits: string[]
  stats: {
    hp: number
    physical: number
    magic: number
    defense: number
    essence: number
  }
  accentColor: string
}

const baseUrl = import.meta.env.BASE_URL
const battleWorkerUrl = (
  import.meta.env.VITE_BATTLE_WORKER_URL ??
  import.meta.env.VITE_LUNA_WORKER_URL ??
  ''
).trim()
const onlineConfigured = battleWorkerUrl.length > 0
const lunaConfigured = lunaWorkerConfigured()
const PROGRESS_STORAGE_KEY = 'petbattle-player-progress-v1'

function loadPlayerProgress(): PlayerProgress {
  if (import.meta.env.DEV) {
    const qa = new URLSearchParams(window.location.search).get('qa')
    if (qa === 'level1') return createInitialProgress()
    if (qa === 'level2') {
      return { ...createInitialProgress(), xp: profileForLevel(2).minXp, battles: 4, wins: 4, streak: 4, bestStreak: 4 }
    }
  }
  try {
    const stored = localStorage.getItem(PROGRESS_STORAGE_KEY)
    return stored ? parseStoredProgress(JSON.parse(stored)) : createInitialProgress()
  } catch {
    return createInitialProgress()
  }
}

const demoLeft: PetView = {
  id: 'player',
  name: 'Ebi Dracat',
  description: '海老と子竜の特徴を併せ持つ応援獣',
  imageUrl: `${baseUrl}demo/aegis-fox.png`,
  traits: ['海老', '子竜', '甲殻', '応援', '植物', '共生'],
  lockedTraits: ['水中機動', '連携攻撃'],
  stats: { hp: 238, physical: 72, magic: 86, defense: 94, essence: 16 },
  accentColor: '#69e7ff',
}

const demoRight: PetView = {
  id: 'opponent',
  name: 'GMK Brewer',
  description: '乾杯の熱気を魔力へ変える陽気な子竜',
  imageUrl: `${baseUrl}demo/ember-golem.png`,
  traits: ['子竜', '麦酒', '祝祭', '発泡', '熱気', '幸運'],
  lockedTraits: ['宴会結界', '黄金泡'],
  stats: { hp: 252, physical: 96, magic: 76, defense: 88, essence: 16 },
  accentColor: '#ff7147',
}

const actions: readonly BattleAction[] = ['physical', 'magic', 'defense']

function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialTheme)
  const [phase, setPhase] = useState<AppPhase>('summon')
  const [battleMode, setBattleMode] = useState<BattleMode>('local')
  const [leftPet, setLeftPet] = useState<PetView>(demoLeft)
  const [rightPet] = useState<PetView>(demoRight)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [message, setMessage] = useState(
    lunaConfigured
      ? translate(locale, 'messageSample')
      : translate(locale, 'messageApiFree'),
  )
  const [error, setError] = useState<string | null>(null)
  const [battle, setBattle] = useState<BattleState>(() => makeBattle(demoLeft, demoRight))
  const [arenaEvent, setArenaEvent] = useState<ArenaEvent | undefined>()
  const [introKey, setIntroKey] = useState(0)
  const [introDone, setIntroDone] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [battleLog, setBattleLog] = useState(() => translate(locale, 'messageDescend'))
  const [roomId, setRoomId] = useState(() => createRoomId())
  const [playerId, setPlayerId] = useState(() => getSessionPlayerId())
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('idle')
  const [onlineNotice, setOnlineNotice] = useState(() => translate(locale, 'messageOnlinePrompt'))
  const [onlineOpponentId, setOnlineOpponentId] = useState<string | null>(null)
  const [onlineActionPending, setOnlineActionPending] = useState(false)
  const [isArenaFullscreen, setIsArenaFullscreen] = useState(false)
  const [progress, setProgress] = useState<PlayerProgress>(loadPlayerProgress)
  const [lastReward, setLastReward] = useState<BattleReward | null>(null)
  const [evolutionTheme, setEvolutionTheme] = useState(() => translate(locale, 'themeFox'))
  const [evolutionFocus, setEvolutionFocus] = useState<EvolutionFocus>('silhouette')
  const [evolutionPrimary, setEvolutionPrimary] = useState('#D96B45')
  const [evolutionAccent, setEvolutionAccent] = useState('#69E7FF')
  const [evolutionReflection, setEvolutionReflection] = useState('')
  const [evolutionArtifact, setEvolutionArtifact] = useState<SvgModelArtifact | null>(null)
  const [evolutionNotice, setEvolutionNotice] = useState(() => translate(locale, 'messageEvolutionPrompt'))
  const [evolutionError, setEvolutionError] = useState<string | null>(null)
  const arenaPanelRef = useRef<HTMLElement | null>(null)
  const roomConnectionRef = useRef<RoomConnection | null>(null)
  const roomCleanupRef = useRef<(() => void) | null>(null)
  const onlineBattleStartedRef = useRef(false)
  const koTimerRef = useRef<number | null>(null)
  const battleActionsRef = useRef<BattleAction[]>([])
  const rewardedBattleRef = useRef<string | null>(null)
  const restoredArtifactRef = useRef(false)

  const reducedMotion = useMemo(
    () => {
      const override = new URLSearchParams(window.location.search).get('motion')
      if (override === 'full') return false
      if (override === 'reduced') return true
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    },
    [],
  )
  const coreLevel = levelForXp(progress.xp)
  const coreProfile = profileForLevel(coreLevel)
  const nextCoreProfile = nextLevelProfile(coreLevel)
  const coreXp = xpProgress(progress)

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    document.documentElement.lang = locale
    try {
      localStorage.setItem('petbattle-theme', themeMode)
      localStorage.setItem('petbattle-locale', locale)
    } catch {
      // Storageなしでも表示設定は現在のセッションで有効。
    }
  }, [locale, themeMode])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('qa')) return
    try {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
    } catch {
      // Storageを利用できない環境でも現在のセッションは継続する。
    }
  }, [progress])

  useEffect(() => {
    if (restoredArtifactRef.current) return
    restoredArtifactRef.current = true
    const savedArtifact = progress.portfolio.find((entry) => entry.artifact)?.artifact
    if (!savedArtifact || !savedArtifact.dataUrl.startsWith('data:image/svg+xml')) return
    setLeftPet({
      id: 'player',
      name: savedArtifact.name,
      description: '学習ポートフォリオから復元した進化Artifact',
      imageUrl: savedArtifact.dataUrl,
      traits: [...savedArtifact.traits, 'Portfolio復元'],
      lockedTraits: ['Effect Recipe · Lv.3', '3D Projection · Lv.4'],
      stats: savedArtifact.stats,
      accentColor: savedArtifact.accentColor,
    })
  }, [progress])

  useEffect(() => () => {
    roomCleanupRef.current?.()
    roomConnectionRef.current?.close(1000, 'Page unmounted')
    if (koTimerRef.current !== null) window.clearTimeout(koTimerRef.current)
  }, [])

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsArenaFullscreen(document.fullscreenElement === arenaPanelRef.current)
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])

  // WebGLの描画停止やタブ復帰があっても、導入後に操作不能にならない保険。
  useEffect(() => {
    if (phase !== 'battle' || introDone) return
    const timer = window.setTimeout(() => {
      setIntroDone(true)
      setBattleLog(translate(locale, 'battleStart'))
    }, reducedMotion ? 20 : 5_600)
    return () => window.clearTimeout(timer)
  }, [introDone, introKey, locale, phase, reducedMotion])

  const localCombatantId = battleMode === 'online' ? playerId : leftPet.id
  const leftCombatant =
    battle.combatants.find((combatant) => combatant.id === localCombatantId) ??
    battle.combatants[0]
  const rightCombatant =
    battle.combatants.find((combatant) => combatant.id !== leftCombatant.id) ??
    battle.combatants[1]
  const displayedRightPet = battleMode === 'online'
    ? {
        ...rightPet,
        id: rightCombatant.id,
        name: onlineOpponentId ?? rightCombatant.id ?? 'ONLINE CHALLENGER',
        description: '通信コロシアムの対戦相手',
      }
    : rightPet

  useEffect(() => {
    if (!showResult || battle.status !== 'finished') return
    const rewardKey = `${introKey}:${battle.turn}:${battle.winnerId ?? 'draw'}`
    if (rewardedBattleRef.current === rewardKey) return
    rewardedBattleRef.current = rewardKey
    const outcome = battle.winnerId === null
      ? 'draw'
      : battle.winnerId === localCombatantId
        ? 'win'
        : 'loss'
    const reward = awardBattleResult(progress, outcome, battleActionsRef.current)
    setProgress(reward.progress)
    setLastReward(reward)
  }, [battle.status, battle.turn, battle.winnerId, introKey, localCombatantId, progress, showResult])

  async function chooseFile(file: File | undefined) {
    if (!file) return
    const isSvg = file.type.toLowerCase() === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
    if (isSvg) {
      if (coreLevel < 2) {
        setError(locale === 'ja' ? 'SVGはCore Level 2で解放されます。バトルXPを蓄積してください。' : 'SVG unlocks at Core Level 2. Earn more Battle XP.')
        return
      }
      if (file.size > coreProfile.maxBytes) {
        setError(locale === 'ja' ? `Lv.${coreLevel}のファイル上限は${Math.round(coreProfile.maxBytes / 1024 / 1024)} MiBです。` : `The Lv.${coreLevel} file limit is ${Math.round(coreProfile.maxBytes / 1024 / 1024)} MiB.`)
        return
      }
      try {
        const svg = validateSvgText(await file.text())
        const nextUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setSelectedFile(null)
        setPreviewUrl(null)
        setLeftPet((current) => ({
          ...current,
          name: file.name.replace(/\.svg$/i, '') || 'SVG Artifact',
          description: '安全なSVG構造を検証したベクターArtifact',
          imageUrl: nextUrl,
          traits: ['SVG', 'ベクター', '構造検証済み', ...current.traits.slice(0, 3)],
        }))
        setError(null)
        setMessage(locale === 'ja' ? 'SVGをローカル検証して召喚しました。外部画像や実行可能要素は含まれていません。' : 'SVG validated locally and summoned. It contains no external images or executable elements.')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : locale === 'ja' ? 'SVGを検証できませんでした。' : 'The SVG could not be validated.')
      }
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(locale === 'ja' ? `Lv.${coreLevel}で召喚できる形式ではありません。` : `This format cannot be summoned at Lv.${coreLevel}.`)
      return
    }
    if (file.size > coreProfile.maxBytes) {
      setError(locale === 'ja' ? `Lv.${coreLevel}のファイル上限は${Math.round(coreProfile.maxBytes / 1024 / 1024)} MiBです。` : `The Lv.${coreLevel} file limit is ${Math.round(coreProfile.maxBytes / 1024 / 1024)} MiB.`)
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const nextUrl = URL.createObjectURL(file)
    setSelectedFile(file)
    setPreviewUrl(nextUrl)
    setLeftPet((current) => ({
      ...current,
      name: file.name.replace(/\.[^.]+$/, '') || 'Unknown Artifact',
      description: locale === 'ja' ? '解析待ちのデジタル表現' : 'Digital artifact awaiting analysis',
      imageUrl: nextUrl,
    }))
    setError(null)
    setMessage(locale === 'ja' ? '画像を読み込みました。「意味を解析」を実行してください。' : 'Artifact loaded. Run Analyze meaning next.')
  }

  async function analyzeSelected() {
    if (!selectedFile) {
      setMessage(locale === 'ja' ? 'サンプルPETの解析済みデータを使用します。' : 'Using the pre-analyzed sample PET data.')
      return
    }
    setIsAnalyzing(true)
    setError(null)
    try {
      const localManifest = await analyzeImageFile(selectedFile)
      let manifest = localManifest
      let analysisMessage = locale === 'ja' ? 'ローカル解析で16個の有効エッセンスを生成しました。' : 'Local analysis generated 16 valid essences.'
      if (lunaConfigured) {
        try {
          const luna = await requestLunaAnalysis(selectedFile, localManifest.source.sha256)
          manifest = createPetManifest({
            sha256: localManifest.source.sha256,
            mime: localManifest.source.mime,
            size: localManifest.source.size,
            features: localManifest.features,
            luna: luna.analysis,
            source: localManifest.source.origin,
          })
          analysisMessage = locale === 'ja' ? 'GPT-5.6 Lunaが意味を認識し、固定ルールで能力値へ変換しました。' : 'GPT-5.6 Luna recognized the meaning; deterministic rules converted it into stats.'
        } catch (lunaError) {
          analysisMessage = locale === 'ja'
            ? `${lunaError instanceof Error ? lunaError.message : 'Luna解析に失敗しました'}。ローカル解析を使用します。`
            : `${lunaError instanceof Error ? lunaError.message : 'Luna analysis failed'}. Falling back to local analysis.`
        }
      }
      const analyzed = manifestToPetView(manifest, leftPet.imageUrl, locale)
      setLeftPet(analyzed)
      setMessage(analysisMessage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : locale === 'ja' ? '画像解析に失敗しました。' : 'Artifact analysis failed.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  function enterArena(nextBattle: BattleState, log: string) {
    setBattle(nextBattle)
    setArenaEvent(undefined)
    setIntroDone(false)
    setShowResult(false)
    setBattleLog(log)
    setLastReward(null)
    battleActionsRef.current = []
    rewardedBattleRef.current = null
    setIntroKey((key) => key + 1)
    setPhase('battle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startLocalBattle() {
    enterArena(
      makeBattle(leftPet, rightPet),
      translate(locale, 'summonSequence'),
    )
  }

  function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale) return
    setLocale(nextLocale)
    setMessage(lunaConfigured ? translate(nextLocale, 'messageSample') : translate(nextLocale, 'messageApiFree'))
    setBattleLog(translate(nextLocale, 'messageDescend'))
    setOnlineNotice(translate(nextLocale, 'messageOnlinePrompt'))
    setEvolutionNotice(translate(nextLocale, 'messageEvolutionPrompt'))
  }

  function toggleThemeMode() {
    setThemeMode((current) => current === 'dark' ? 'light' : 'dark')
  }

  async function toggleArenaFullscreen() {
    const arenaPanel = arenaPanelRef.current
    if (!arenaPanel) return
    try {
      if (document.fullscreenElement === arenaPanel) {
        await document.exitFullscreen()
      } else {
        await arenaPanel.requestFullscreen()
      }
    } catch {
      setBattleLog(translate(locale, 'fullscreenError'))
    }
  }

  function selectBattleMode(nextMode: BattleMode) {
    if (nextMode === battleMode) return
    if (battleMode === 'online') disconnectOnline(true)
    setBattleMode(nextMode)
    setOnlineStatus('idle')
    setOnlineActionPending(false)
    setOnlineOpponentId(null)
    setOnlineNotice(translate(locale, 'messageOnlinePrompt'))
  }

  function clearRoomConnection() {
    roomCleanupRef.current?.()
    roomCleanupRef.current = null
    const connection = roomConnectionRef.current
    roomConnectionRef.current = null
    if (connection) {
      try {
        connection.close(1000, 'Client left the room')
      } catch {
        // すでに切断済みなら何もしない。
      }
    }
  }

  function disconnectOnline(silent = false) {
    clearRoomConnection()
    onlineBattleStartedRef.current = false
    setOnlineActionPending(false)
    if (!silent) {
      setOnlineStatus('disconnected')
      setOnlineNotice(locale === 'ja' ? 'ルームから切断しました。再接続できます。' : 'Disconnected from the room. You can reconnect.')
    }
  }

  function connectOnline() {
    if (!onlineConfigured) {
      setOnlineStatus('error')
      setOnlineNotice(locale === 'ja' ? 'VITE_BATTLE_WORKER_URLを設定すると通信対戦を利用できます。' : 'Set VITE_BATTLE_WORKER_URL to enable online battles.')
      return
    }
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(roomId)) {
      setOnlineStatus('error')
      setOnlineNotice(locale === 'ja' ? 'ルームIDは半角英数字・_・-で3〜64文字にしてください。' : 'Room ID must be 3–64 letters, numbers, underscores, or hyphens.')
      return
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(playerId)) {
      setOnlineStatus('error')
      setOnlineNotice(locale === 'ja' ? 'プレイヤーIDは半角英数字・_・-で1〜64文字にしてください。' : 'Player ID must be 1–64 letters, numbers, underscores, or hyphens.')
      return
    }

    clearRoomConnection()
    onlineBattleStartedRef.current = false
    setOnlineOpponentId(null)
    setOnlineActionPending(false)
    setOnlineStatus('connecting')
    setOnlineNotice(locale === 'ja' ? '通信コロシアムへ接続しています…' : 'Connecting to the online colosseum…')

    try {
      const connection = connectRoom({
        workerUrl: battleWorkerUrl,
        roomId,
        playerId,
      })
      const unsubscribe = connection.subscribe((nextMessage) =>
        handleOnlineMessage(nextMessage, playerId),
      )
      const handleClosed = () => {
        setOnlineActionPending(false)
        setOnlineStatus('disconnected')
        setOnlineNotice(locale === 'ja' ? 'サーバーとの接続が切れました。再接続してください。' : 'Server connection lost. Please reconnect.')
      }
      const handleSocketError = () => {
        setOnlineStatus('error')
        setOnlineNotice(locale === 'ja' ? '通信エラーが発生しました。Worker URLとネットワークを確認してください。' : 'A network error occurred. Check the Worker URL and your connection.')
      }
      connection.socket.addEventListener('close', handleClosed)
      connection.socket.addEventListener('error', handleSocketError)
      roomConnectionRef.current = connection
      roomCleanupRef.current = () => {
        unsubscribe()
        connection.socket.removeEventListener('close', handleClosed)
        connection.socket.removeEventListener('error', handleSocketError)
      }
    } catch (cause) {
      clearRoomConnection()
      setOnlineStatus('error')
      setOnlineNotice(cause instanceof Error ? cause.message : locale === 'ja' ? '通信対戦へ接続できませんでした。' : 'Could not connect to the online battle.')
    }
  }

  function readyOnlinePet() {
    const connection = roomConnectionRef.current
    if (!connection) return
    try {
      connection.ready({
        hp: leftPet.stats.hp,
        physical: leftPet.stats.physical,
        magic: leftPet.stats.magic,
        defense: leftPet.stats.defense,
      })
      setOnlineStatus('waiting')
      setOnlineNotice(locale === 'ja' ? 'READYを送信しました。相手の接続とREADYを待っています。' : 'READY sent. Waiting for the opponent to connect and ready up.')
    } catch (cause) {
      setOnlineStatus('error')
      setOnlineNotice(cause instanceof Error ? cause.message : locale === 'ja' ? 'READYを送信できませんでした。' : 'Could not send READY.')
    }
  }

  function handleOnlineMessage(nextMessage: RoomServerMessage, expectedPlayerId: string) {
    if (nextMessage.type === 'connected') {
      setOnlineStatus('connected')
      setOnlineNotice(locale === 'ja' ? `ROOM ${nextMessage.roomId} に接続しました。PETをREADYしてください。` : `Connected to ROOM ${nextMessage.roomId}. READY your PET.`)
      return
    }
    if (nextMessage.type === 'presence') {
      const local = nextMessage.players.find((player) => player.id === expectedPlayerId)
      const opponent = nextMessage.players.find((player) => player.id !== expectedPlayerId)
      setOnlineOpponentId(opponent?.id ?? null)
      if (onlineBattleStartedRef.current) {
        if (opponent?.connected) {
          setOnlineStatus((current) => current === 'action-locked' ? current : 'active')
          setOnlineNotice(locale === 'ja' ? '2人の接続を確認。サーバー権威でターンを同期中です。' : 'Two players connected. Synchronizing the authoritative turn state.')
        } else {
          setOnlineStatus('disconnected')
          setOnlineNotice(locale === 'ja' ? '対戦相手との接続が切れました。再接続を待っています。' : 'Opponent disconnected. Waiting for reconnection.')
        }
      } else if (local?.ready) {
        setOnlineStatus('waiting')
        setOnlineNotice(opponent?.ready
          ? locale === 'ja' ? '双方READY。バトル状態を同期しています…' : 'Both players READY. Synchronizing battle state…'
          : locale === 'ja' ? 'あなたはREADYです。対戦相手を待っています。' : 'You are READY. Waiting for the opponent.')
      } else {
        setOnlineStatus('connected')
      }
      return
    }
    if (nextMessage.type === 'battleStarted') {
      if (!nextMessage.state.combatants.some((combatant) => combatant.id === expectedPlayerId)) {
        setOnlineStatus('error')
        setOnlineNotice(locale === 'ja' ? '受信したバトル状態に自分のPETが存在しません。' : 'Your PET is missing from the received battle state.')
        return
      }
      const opponent = nextMessage.state.combatants.find(
        (combatant) => combatant.id !== expectedPlayerId,
      )
      setOnlineOpponentId(opponent?.id ?? null)
      onlineBattleStartedRef.current = true
      setOnlineActionPending(false)
      setOnlineStatus('active')
      setOnlineNotice(nextMessage.state.status === 'finished'
        ? locale === 'ja' ? '終了済みのバトル状態をサーバーから復元しました。' : 'Restored a completed battle from the server.'
        : locale === 'ja' ? '対戦開始。行動は双方が揃うまで相手へ公開されません。' : 'Battle started. Actions stay hidden until both players submit.')
      enterArena(
        nextMessage.state,
        nextMessage.state.status === 'finished'
          ? locale === 'ja' ? '通信同期完了。最終結果を復元しました。' : 'Synchronization complete. Final result restored.'
          : locale === 'ja' ? '通信同期完了。コロシアムへ降下中…' : 'Synchronization complete. Descending into the colosseum…',
      )
      if (nextMessage.state.status === 'finished') setShowResult(true)
      return
    }
    if (nextMessage.type === 'actionAccepted') {
      setOnlineActionPending(true)
      setOnlineStatus('action-locked')
      setOnlineNotice(locale === 'ja' ? `TURN ${nextMessage.turn} の行動を秘密状態で確定しました。` : `TURN ${nextMessage.turn} action locked in hidden state.`)
      setBattleLog(locale === 'ja' ? '行動を確定しました。対戦相手の選択を待っています…' : 'Action locked. Waiting for the opponent…')
      return
    }
    if (nextMessage.type === 'turnResolved') {
      setBattle(nextMessage.state)
      setOnlineActionPending(false)
      setOnlineStatus('active')
      setOnlineNotice(locale === 'ja' ? '双方の行動をサーバーが判定しました。' : 'The server resolved both actions.')
      const nextArenaEvent = arenaEventFromBattleEvents(
        nextMessage.events,
        expectedPlayerId,
      )
      if (nextArenaEvent) setArenaEvent(nextArenaEvent)
      setBattleLog(onlineTurnLabel(nextMessage.events, expectedPlayerId, locale))
      if (nextMessage.state.status === 'finished') {
        const knockedOut = nextMessage.events.find(
          (event) => event.type === 'knockout',
        )
        if (koTimerRef.current !== null) window.clearTimeout(koTimerRef.current)
        koTimerRef.current = window.setTimeout(() => {
          if (knockedOut?.type === 'knockout') {
            setArenaEvent({
              id: `ko-${Date.now()}`,
              type: 'ko',
              actor: knockedOut.combatantId === expectedPlayerId ? 'left' : 'right',
            })
          }
          setShowResult(true)
          koTimerRef.current = null
        }, reducedMotion ? 30 : 900)
      }
      return
    }
    if (nextMessage.type === 'opponentDisconnected') {
      setOnlineActionPending(false)
      setOnlineStatus('disconnected')
      setOnlineNotice(locale === 'ja' ? `${nextMessage.playerId} が切断しました。再接続を待っています。` : `${nextMessage.playerId} disconnected. Waiting for reconnection.`)
      setBattleLog(locale === 'ja' ? '対戦相手が切断しました。ターンを一時停止しています。' : 'Opponent disconnected. The turn is paused.')
      return
    }
    setOnlineStatus('error')
    setOnlineActionPending(false)
    setOnlineNotice(nextMessage.message)
  }

  function playTurn(playerAction: BattleAction) {
    if (!introDone || battle.status !== 'active') return
    if (battleMode === 'online') {
      if (
        onlineActionPending ||
        onlineStatus !== 'active' ||
        !roomConnectionRef.current
      ) return
      try {
        roomConnectionRef.current.action(playerAction)
        battleActionsRef.current = [...battleActionsRef.current, playerAction]
        setOnlineActionPending(true)
        setOnlineStatus('action-locked')
        setBattleLog(locale === 'ja' ? `${actionName(playerAction, locale)}を秘密状態で送信中…` : `Sending ${actionName(playerAction, locale)} as a hidden action…`)
      } catch (cause) {
        setOnlineActionPending(false)
        setOnlineStatus('error')
        setOnlineNotice(cause instanceof Error ? cause.message : locale === 'ja' ? '行動を送信できませんでした。' : 'Could not send the action.')
      }
      return
    }
    battleActionsRef.current = [...battleActionsRef.current, playerAction]
    const cpuAction = actions[(battle.turn * 7 + battle.seed) % actions.length]
    const result = resolveTurn(battle, {
      [leftPet.id]: playerAction,
      [rightPet.id]: cpuAction,
    })
    const winnerIsLeft = actionBeats(playerAction, cpuAction)
    const winnerIsRight = actionBeats(cpuAction, playerAction)
    const actor = winnerIsRight ? 'right' : 'left'
    let eventType: ArenaEvent['type'] = winnerIsLeft
      ? playerAction
      : winnerIsRight
        ? cpuAction
        : playerAction
    if ((winnerIsLeft && playerAction === 'defense') || (winnerIsRight && cpuAction === 'defense')) {
      eventType = 'counter'
    }
    setArenaEvent({ id: `${result.state.turn}-${Date.now()}`, type: eventType, actor })
    setBattle(result.state)
    setBattleLog(turnLabel(playerAction, cpuAction, result.events, locale))

    if (result.state.status === 'finished') {
      if (koTimerRef.current !== null) window.clearTimeout(koTimerRef.current)
      koTimerRef.current = window.setTimeout(() => {
        setArenaEvent({
          id: `ko-${Date.now()}`,
          type: 'ko',
          actor: result.state.winnerId === leftPet.id ? 'right' : 'left',
        })
        setShowResult(true)
        koTimerRef.current = null
      }, reducedMotion ? 30 : 900)
    }
  }

  function prepareEvolutionArtifact() {
    if (coreLevel < 2) {
      const remainingXp = Math.max(0, profileForLevel(2).minXp - progress.xp)
      setEvolutionError(locale === 'ja' ? `SVG Evolution Questはあと${remainingXp} XPで解放されます。` : `SVG Evolution Quest unlocks in ${remainingXp} XP.`)
      return
    }
    try {
      const artifact = buildSvgModel({
        theme: evolutionTheme,
        focus: evolutionFocus,
        primaryColor: evolutionPrimary,
        accentColor: evolutionAccent,
        locale,
      })
      setEvolutionArtifact(artifact)
      setEvolutionError(null)
      setEvolutionNotice(locale === 'ja'
        ? '助言を確認し、構造と見た目を比較してください。完成理由を言葉にすると進化を記録できます。'
        : 'Compare the guidance with the structure and appearance. Explain your design choices to record the evolution.')
    } catch (cause) {
      setEvolutionError(cause instanceof Error ? cause.message : locale === 'ja' ? 'SVGモデルを構築できませんでした。' : 'The SVG model could not be built.')
    }
  }

  function completeEvolutionArtifact() {
    if (!evolutionArtifact) {
      setEvolutionError(locale === 'ja' ? '先にSVGモデルを構築してください。' : 'Build the SVG model first.')
      return
    }
    const reflection = evolutionReflection.trim()
    if (reflection.length < 8) {
      setEvolutionError(locale === 'ja' ? '何をどう作ったかを8文字以上で振り返ってください。' : 'Explain what and how you built it in at least 8 characters.')
      return
    }
    const focusBonus = evolutionFocus === 'silhouette'
      ? { physical: 8, magic: 2, defense: 3 }
      : evolutionFocus === 'layers'
        ? { physical: 2, magic: 3, defense: 8 }
        : { physical: 3, magic: 8, defense: 2 }
    const firstCompletion = !progress.completedQuestIds.includes(evolutionArtifact.questId)
    const evolvedStats = firstCompletion ? {
      hp: leftPet.stats.hp + 10,
      physical: leftPet.stats.physical + focusBonus.physical,
      magic: leftPet.stats.magic + focusBonus.magic,
      defense: leftPet.stats.defense + focusBonus.defense,
      essence: Math.max(leftPet.stats.essence, 32),
    } : leftPet.stats
    const completion = completeEvolutionQuest(progress, {
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `artifact-${Date.now()}`,
      questId: evolutionArtifact.questId,
      theme: evolutionTheme.trim(),
      format: 'SVG',
      focus: evolutionFocusLabel(evolutionFocus, locale),
      reflection,
      createdAt: new Date().toISOString(),
      artifact: {
        name: evolutionArtifact.name,
        dataUrl: evolutionArtifact.dataUrl,
        accentColor: evolutionAccent,
        traits: [...evolutionArtifact.traits, locale === 'ja' ? '学習Evidence' : 'Learning Evidence'],
        stats: evolvedStats,
      },
    })
    setProgress(completion.progress)
    setLeftPet({
      ...leftPet,
      name: evolutionArtifact.name,
      description: locale === 'ja'
        ? `${evolutionTheme.trim()}を基本図形とパスだけで構築したSVGモデル`
        : `An SVG model of ${evolutionTheme.trim()} built only from basic shapes and paths`,
      imageUrl: evolutionArtifact.dataUrl,
      traits: [...evolutionArtifact.traits, locale === 'ja' ? '学習Evidence' : 'Learning Evidence'],
      lockedTraits: ['Effect Recipe · Lv.3', '3D Projection · Lv.4'],
      stats: evolvedStats,
      accentColor: evolutionAccent,
    })
    setEvolutionError(null)
    setEvolutionNotice(completion.xpGained > 0
      ? locale === 'ja' ? `SVG Questを修了し、学習ポートフォリオへ保存しました。+${completion.xpGained} XP` : `SVG Quest completed and saved to the learning portfolio. +${completion.xpGained} XP`
      : locale === 'ja' ? '同じQuestのモデルを更新しました。XPは初回修了時だけ獲得します。' : 'Updated this Quest model. XP is awarded only on first completion.')
    setMessage(locale === 'ja' ? '進化したSVGモデルを次のバトルへ召喚できます。' : 'The evolved SVG model is ready for the next battle.')
  }

  function openEvolutionLab() {
    backToLab()
    window.setTimeout(() => {
      document.getElementById('evolution-lab')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    }, 60)
  }

  function backToLab() {
    if (battleMode === 'online') {
      disconnectOnline(true)
      setOnlineStatus('idle')
      setRoomId(createRoomId())
      setOnlineNotice(locale === 'ja' ? '新しいルームを作成しました。接続後にPETをREADYできます。' : 'New room created. Connect, then READY your PET.')
    }
    setPhase('summon')
    setShowResult(false)
    setArenaEvent(undefined)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeStep = phase === 'summon' ? (progress.portfolio.length > 0 ? 4 : 1) : showResult ? 4 : 3

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <div className="brand-mark">PB</div>
          <div>
            <div className="brand-name">PETBATTLE</div>
            <div className="brand-caption">PLAYABLE EXPRESSION TOKEN</div>
          </div>
        </div>
        <div className="header-actions">
          <div className="build-badge">OPENAI BUILD WEEK · PROTOTYPE</div>
          <button type="button" className="display-toggle" aria-label={translate(locale, themeMode === 'dark' ? 'switchToLight' : 'switchToDark')} onClick={toggleThemeMode}>
            <span aria-hidden="true">{themeMode === 'dark' ? '☀' : '☾'}</span>{themeMode === 'dark' ? 'LIGHT' : 'DARK'}
          </button>
          <div className="locale-toggle" role="group" aria-label="Language">
            <button type="button" className={locale === 'ja' ? 'active' : ''} aria-pressed={locale === 'ja'} onClick={() => changeLocale('ja')}>JA</button>
            <button type="button" className={locale === 'en' ? 'active' : ''} aria-pressed={locale === 'en'} onClick={() => changeLocale('en')}>EN</button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {phase === 'summon' && (
          <div className="hero-copy">
            <div className="eyebrow">{translate(locale, 'heroEyebrow')}</div>
            <h1>{translate(locale, 'heroTitle1')}<br /><span>{translate(locale, 'heroTitle2')}</span></h1>
            <p>{translate(locale, 'heroDescription')}</p>
          </div>
        )}

        <div className="stepper" aria-label={translate(locale, 'progressLabel')}>
          {[translate(locale, 'stepSummon'), translate(locale, 'stepAnalyze'), translate(locale, 'stepBattle'), translate(locale, 'stepEvolution')].map((label, index) => {
            const step = index + 1
            return <span key={label} className={`step-chip ${step === activeStep ? 'active' : step < activeStep ? 'done' : ''}`}>{step}. {label}</span>
          })}
        </div>

        {phase === 'summon' ? (
          <>
          <section className="panel summon-panel">
            <div className="panel-heading">
              <div><h2>{translate(locale, 'summonLab')}</h2><p>Lv.{coreLevel} · {coreProfile.maxBytes / 1024 / 1024} MiB · {translate(locale, 'coreCapacity')} {coreProfile.essenceCapacity}</p></div>
              <div className="runtime-badges">
                <div className={`runtime-pill ${lunaConfigured ? 'connected' : 'local'}`}>
                  <i aria-hidden="true" />
                  {translate(locale, lunaConfigured ? 'localLuna' : 'apiFree')}
                </div>
                <div className="level-pill">CORE LEVEL {coreLevel}</div>
              </div>
            </div>
            <div className="summon-grid">
              <PetCard
                pet={leftPet}
                role={translate(locale, 'yourArtifact')}
                testId="player-summon-card"
                locale={locale}
                accept={coreLevel >= 2 ? 'image/jpeg,image/png,image/webp,image/svg+xml,.svg' : 'image/jpeg,image/png,image/webp'}
                onFile={chooseFile}
              />
              <PetCoreVisualizer pet={leftPet} level={coreLevel} essenceCapacity={coreProfile.essenceCapacity} locale={locale} />
            </div>
            <button className="secondary-button" type="button" onClick={analyzeSelected} disabled={isAnalyzing} style={{ marginTop: 18 }}>
              {translate(locale, isAnalyzing ? 'analyzing' : lunaConfigured ? 'analyze' : 'analyzeLocal')}
            </button>
            <div className="battle-mode-card">
              <div className="battle-mode-heading">
                <div>
                  <strong>{translate(locale, 'battleMode')}</strong>
                  <span>{translate(locale, 'battleModeDescription')}</span>
                </div>
                <div className="mode-tabs" role="tablist" aria-label={translate(locale, 'battleMode')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={battleMode === 'local'}
                    className={battleMode === 'local' ? 'active' : ''}
                    onClick={() => selectBattleMode('local')}
                  >LOCAL CPU</button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={battleMode === 'online'}
                    className={battleMode === 'online' ? 'active' : ''}
                    onClick={() => selectBattleMode('online')}
                  >ONLINE 1V1</button>
                </div>
              </div>

              {battleMode === 'online' && (
                <div className="online-setup">
                  {!onlineConfigured && (
                    <div className="worker-notice" role="note">
                      <strong>{translate(locale, 'workerMissing')}</strong>
                      <span><code>VITE_BATTLE_WORKER_URL</code> — {translate(locale, 'workerMissingDescription')}</span>
                    </div>
                  )}
                  <div className="room-fields">
                    <label>
                      <span>ROOM ID</span>
                      <input
                        value={roomId}
                        maxLength={64}
                        disabled={onlineStatus === 'connecting' || onlineStatus === 'waiting' || onlineStatus === 'active' || onlineStatus === 'action-locked'}
                        onChange={(event) => setRoomId(event.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      type="button"
                      className="room-refresh"
                      aria-label={translate(locale, 'newRoomId')}
                      title={translate(locale, 'newRoomId')}
                      disabled={onlineStatus === 'connecting' || onlineStatus === 'waiting' || onlineStatus === 'active' || onlineStatus === 'action-locked'}
                      onClick={() => setRoomId(createRoomId())}
                    >↻</button>
                    <label>
                      <span>PLAYER ID</span>
                      <input
                        value={playerId}
                        maxLength={64}
                        disabled={onlineStatus === 'connecting' || onlineStatus === 'waiting' || onlineStatus === 'active' || onlineStatus === 'action-locked'}
                        onChange={(event) => setPlayerId(event.target.value)}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <div className={`online-status ${onlineStatus}`} aria-live="polite">
                    <span className="status-dot" aria-hidden="true" />
                    <div><strong>{onlineStatusLabel(onlineStatus, locale)}</strong><small>{onlineNotice}</small></div>
                  </div>
                </div>
              )}
            </div>

            {battleMode === 'local' ? (
              <button className="primary-button" type="button" onClick={startLocalBattle}>{translate(locale, 'startCpu')}</button>
            ) : onlineStatus === 'connected' ? (
              <button className="primary-button" type="button" onClick={readyOnlinePet}>{translate(locale, 'readyPet')}</button>
            ) : onlineStatus === 'waiting' ? (
              <button className="primary-button" type="button" disabled>{translate(locale, 'waitOpponent')}</button>
            ) : onlineStatus === 'connecting' ? (
              <button className="primary-button" type="button" disabled>{translate(locale, 'connectingArena')}</button>
            ) : (
              <button className="primary-button" type="button" disabled={!onlineConfigured} onClick={connectOnline}>
                {translate(locale, onlineStatus === 'disconnected' || onlineStatus === 'error' ? 'reconnectRoom' : 'connectRoom')}
              </button>
            )}
            <div className={`status-message ${error ? 'error' : ''}`}>{error ?? message}</div>
          </section>
          <ProgressionPanel
            progress={progress}
            level={coreLevel}
            xpCurrent={coreXp.current}
            xpRequired={coreXp.required}
            xpRatio={coreXp.ratio}
            nextUnlock={nextCoreProfile ? levelUnlockLabel(nextCoreProfile.level, locale) : translate(locale, 'allUnlocked')}
            theme={evolutionTheme}
            focus={evolutionFocus}
            primaryColor={evolutionPrimary}
            accentColor={evolutionAccent}
            reflection={evolutionReflection}
            artifact={evolutionArtifact}
            notice={evolutionNotice}
            error={evolutionError}
            locale={locale}
            onThemeChange={setEvolutionTheme}
            onFocusChange={setEvolutionFocus}
            onPrimaryChange={setEvolutionPrimary}
            onAccentChange={setEvolutionAccent}
            onReflectionChange={setEvolutionReflection}
            onBuild={prepareEvolutionArtifact}
            onComplete={completeEvolutionArtifact}
          />
          </>
        ) : (
          <section ref={arenaPanelRef} className={`panel arena-panel ${isArenaFullscreen ? 'is-fullscreen' : ''}`}>
            <div className="arena-stage">
              <Arena3D
                leftPet={{ name: leftPet.name, imageUrl: leftPet.imageUrl, accentColor: leftPet.accentColor, hp: leftCombatant.hp, maxHp: leftCombatant.maxHp }}
                rightPet={{ name: displayedRightPet.name, imageUrl: displayedRightPet.imageUrl, accentColor: displayedRightPet.accentColor, hp: rightCombatant.hp, maxHp: rightCombatant.maxHp }}
                event={arenaEvent}
                introKey={introKey}
                reducedMotion={reducedMotion}
                skipLabel={locale === 'ja' ? 'イントロをスキップ' : 'Skip intro'}
                ariaLabel={locale === 'ja' ? 'PETBATTLE 3Dバトルコロシアム' : 'PETBATTLE 3D Battle Colosseum'}
                onIntroComplete={() => { setIntroDone(true); setBattleLog(translate(locale, 'battleStart')) }}
                onSkipIntro={() => { setIntroDone(true); setBattleLog(translate(locale, 'battleSkip')) }}
              />
            </div>
            <div className={`battle-overlay ${introDone ? 'intro-complete' : 'intro-active'}`}>
              <div className="battle-top">
                <FighterHud name={leftPet.name} hp={leftCombatant.hp} maxHp={leftCombatant.maxHp} />
                <div className="turn-stack">
                  <div className="turn-badge">TURN {battle.turn}</div>
                  {battleMode === 'online' && (
                    <div className={`arena-online-state ${onlineStatus}`}>
                      <span className="status-dot" />{onlineStatusLabel(onlineStatus, locale)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="arena-fullscreen-button"
                    aria-label={translate(locale, isArenaFullscreen ? 'fullscreenClose' : 'fullscreenOpen')}
                    aria-pressed={isArenaFullscreen}
                    onClick={toggleArenaFullscreen}
                  >
                    <span aria-hidden="true">{isArenaFullscreen ? '↙' : '⛶'}</span>
                    {isArenaFullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
                  </button>
                </div>
                <FighterHud name={displayedRightPet.name} hp={rightCombatant.hp} maxHp={rightCombatant.maxHp} right />
              </div>
              <div className="battle-bottom">
                <div className="arena-command-deck">
                  <div className="arena-command-heading">
                    <span>BATTLE COMMAND</span>
                    <p aria-live="polite">{battleLog}</p>
                  </div>
                  <div className="action-bar" aria-label={translate(locale, 'battleActions')}>
                    <ActionButton action="physical" icon="⚔" label={translate(locale, 'physical')} note={translate(locale, 'physicalCommandNote')} disabled={!introDone || battle.status !== 'active' || (battleMode === 'online' && (onlineActionPending || onlineStatus !== 'active'))} onClick={playTurn} />
                    <ActionButton action="magic" icon="✦" label={translate(locale, 'magic')} note={translate(locale, 'magicCommandNote')} disabled={!introDone || battle.status !== 'active' || (battleMode === 'online' && (onlineActionPending || onlineStatus !== 'active'))} onClick={playTurn} />
                    <ActionButton action="defense" icon="⬡" label={translate(locale, 'defense')} note={translate(locale, 'defenseCommandNote')} disabled={!introDone || battle.status !== 'active' || (battleMode === 'online' && (onlineActionPending || onlineStatus !== 'active'))} onClick={playTurn} />
                  </div>
                </div>
              </div>
            </div>
            {battleMode === 'online' && (onlineStatus === 'disconnected' || onlineStatus === 'error') && !showResult && (
              <div className="connection-banner" role="alert">
                <strong>{onlineStatus === 'disconnected' ? 'CONNECTION PAUSED' : 'CONNECTION ERROR'}</strong>
                <span>{onlineNotice}</span>
                <button type="button" onClick={backToLab}>{translate(locale, 'backSummonLong')}</button>
              </div>
            )}
            {showResult && (
              <div className="result-card">
                <div className="trophy">🏆</div>
                <h2>{battle.winnerId === localCombatantId ? `${leftPet.name} WIN` : battle.winnerId === rightCombatant.id ? `${displayedRightPet.name} WIN` : 'DRAW'}</h2>
                {lastReward ? (
                  <>
                    <div className="result-xp-line"><strong>+{lastReward.xpGained} XP</strong><span>{translate(locale, 'actionVariety', { value: lastReward.varietyBonus })}</span></div>
                    <div className="result-level-line"><span>CORE LEVEL {lastReward.currentLevel}</span><b>{xpProgress(lastReward.progress).current} / {xpProgress(lastReward.progress).required || 'MAX'} XP</b></div>
                    <div className="result-xp-track"><i style={{ width: `${xpProgress(lastReward.progress).ratio * 100}%` }} /></div>
                    <p>{lastReward.leveledUp
                      ? translate(locale, 'levelUp', { level: lastReward.currentLevel, unlock: levelUnlockLabel(lastReward.currentLevel, locale) })
                      : nextLevelProfile(lastReward.currentLevel)
                        ? translate(locale, 'xpRemaining', { xp: nextLevelProfile(lastReward.currentLevel)!.minXp - lastReward.progress.xp })
                        : translate(locale, 'maxLevel')}</p>
                  </>
                ) : <p>{translate(locale, 'calculatingResult')}</p>}
                <div className="result-actions">
                  <button type="button" className="secondary-button" onClick={backToLab}>{translate(locale, 'backSummon')}</button>
                  {coreLevel >= 2 && <button type="button" className="secondary-button" onClick={openEvolutionLab}>{translate(locale, 'evolutionLab')}</button>}
                  {battleMode === 'local' && <button type="button" className="secondary-button" onClick={startLocalBattle}>{translate(locale, 'rematch')}</button>}
                </div>
              </div>
            )}
          </section>
        )}
        <div className="footer-note">{translate(locale, 'footer')}</div>
      </main>
    </div>
  )
}

function ProgressionPanel({
  progress,
  level,
  xpCurrent,
  xpRequired,
  xpRatio,
  nextUnlock,
  theme,
  focus,
  primaryColor,
  accentColor,
  reflection,
  artifact,
  notice,
  error,
  locale,
  onThemeChange,
  onFocusChange,
  onPrimaryChange,
  onAccentChange,
  onReflectionChange,
  onBuild,
  onComplete,
}: {
  progress: PlayerProgress
  level: number
  xpCurrent: number
  xpRequired: number
  xpRatio: number
  nextUnlock: string
  theme: string
  focus: EvolutionFocus
  primaryColor: string
  accentColor: string
  reflection: string
  artifact: SvgModelArtifact | null
  notice: string
  error: string | null
  locale: Locale
  onThemeChange: (value: string) => void
  onFocusChange: (value: EvolutionFocus) => void
  onPrimaryChange: (value: string) => void
  onAccentChange: (value: string) => void
  onReflectionChange: (value: string) => void
  onBuild: () => void
  onComplete: () => void
}) {
  const svgUnlockXp = profileForLevel(2).minXp
  const svgUnlocked = level >= 2
  return (
    <section id="evolution-lab" className="panel progression-panel">
      <div className="progression-heading">
        <div><span>{translate(locale, 'coreJourney')}</span><h2>{translate(locale, 'growthLab')}</h2><p>{translate(locale, 'growthDescription')}</p></div>
        <div className="progression-level">LV.{level}</div>
      </div>

      <div className="progression-summary">
        <div className="xp-card">
          <div><span>CORE EXPERIENCE</span><strong>{progress.xp} XP</strong></div>
          <div className="xp-track" aria-label={`レベル経験値 ${xpCurrent} / ${xpRequired || 'MAX'}`}><i style={{ width: `${xpRatio * 100}%` }} /></div>
          <small>{xpRequired > 0 ? translate(locale, 'nextUnlock', { name: nextUnlock, xp: xpRequired - xpCurrent }) : translate(locale, 'allUnlocked')}</small>
        </div>
        <div className="career-stats">
          <div><span>{translate(locale, 'battles')}</span><strong>{progress.battles}</strong></div>
          <div><span>{translate(locale, 'wins')}</span><strong>{progress.wins}</strong></div>
          <div><span>{translate(locale, 'streak')}</span><strong>{progress.streak}</strong></div>
          <div><span>{translate(locale, 'quests')}</span><strong>{progress.completedQuestIds.length}</strong></div>
        </div>
      </div>

      <div className="mastery-row" aria-label={translate(locale, 'masteryLabel')}>
        <span>{translate(locale, 'physicalMastery', { value: progress.mastery.physical })}</span>
        <span>{translate(locale, 'magicMastery', { value: progress.mastery.magic })}</span>
        <span>{translate(locale, 'defenseMastery', { value: progress.mastery.defense })}</span>
      </div>

      <div className="level-roadmap" aria-label={translate(locale, 'roadmap')}>
        {LEVEL_PROFILES.map((profile) => (
          <article key={profile.level} className={profile.level === level ? 'current' : profile.level < level ? 'unlocked' : 'locked'}>
            <div><b>LV.{profile.level}</b><span>{profile.minXp} XP</span></div>
            <strong>{levelUnlockLabel(profile.level, locale)}</strong>
            <small>{profile.formats.join(' / ')} · {profile.essenceCapacity} ESS</small>
            <p>{levelLearningLabel(profile.level, locale)}</p>
          </article>
        ))}
      </div>

      <div className={`evolution-quest ${svgUnlocked ? 'unlocked' : 'locked'}`}>
        <div className="quest-heading">
          <div><span>EVOLUTION QUEST 01 · SVG</span><h3>{translate(locale, 'questTitle')}</h3></div>
          <div className="quest-state">{svgUnlocked ? 'UNLOCKED' : `${Math.max(0, svgUnlockXp - progress.xp)} XP TO UNLOCK`}</div>
        </div>
        {!svgUnlocked ? (
          <div className="quest-locked-copy">
            <strong>{translate(locale, 'unlockInWins')}</strong>
            <p>{translate(locale, 'questLockedDescription')}</p>
          </div>
        ) : (
          <div className="quest-workspace">
            <div className="quest-form">
              <label><span>{translate(locale, 'themeLabel')}</span><input list="theme-examples" value={theme} maxLength={30} onChange={(event) => onThemeChange(event.target.value)} /></label>
              <datalist id="theme-examples"><option value={translate(locale, 'themeFox')} /><option value={translate(locale, 'themeOwl')} /><option value={translate(locale, 'themeTurtle')} /><option value={translate(locale, 'themeWolf')} /></datalist>
              <label><span>{translate(locale, 'focusLabel')}</span><select value={focus} onChange={(event) => onFocusChange(event.target.value as EvolutionFocus)}><option value="silhouette">{translate(locale, 'focusSilhouette')}</option><option value="layers">{translate(locale, 'focusLayers')}</option><option value="symbol">{translate(locale, 'focusSymbol')}</option></select></label>
              <div className="color-fields">
                <label><span>{translate(locale, 'primaryColor')}</span><input type="color" value={primaryColor} onChange={(event) => onPrimaryChange(event.target.value)} /></label>
                <label><span>{translate(locale, 'glowColor')}</span><input type="color" value={accentColor} onChange={(event) => onAccentChange(event.target.value)} /></label>
              </div>
              <button type="button" className="secondary-button" onClick={onBuild}>{translate(locale, 'buildSvg')}</button>
            </div>
            <div className="quest-output">
              {artifact ? (
                <>
                  <div className="svg-preview"><img src={artifact.dataUrl} alt={locale === 'ja' ? `${theme}のSVGモデルプレビュー` : `SVG model preview: ${theme}`} /></div>
                  <div className="advice-grid">
                    <div><span>OBSERVE</span><p>{artifact.advice.observation}</p></div>
                    <div><span>DECOMPOSE</span><p>{artifact.advice.decomposition}</p></div>
                    <div><span>BUILD</span><p>{artifact.advice.construction}</p></div>
                    <div><span>VERIFY</span><p>{artifact.advice.validation}</p></div>
                  </div>
                  <label className="reflection-field"><span>{translate(locale, 'reflectionLabel')}</span><textarea value={reflection} rows={3} placeholder={translate(locale, 'reflectionPlaceholder')} onChange={(event) => onReflectionChange(event.target.value)} /></label>
                  <button type="button" className="primary-button quest-complete" onClick={onComplete}>{translate(locale, 'saveEvidence')}</button>
                </>
              ) : <div className="quest-placeholder"><span>{translate(locale, 'noSourceImage')}</span><strong>{translate(locale, 'thinkStructure')}</strong><p>{translate(locale, 'thinkStructureDescription')}</p></div>}
            </div>
          </div>
        )}
        <div className={`quest-notice ${error ? 'error' : ''}`} aria-live="polite">{error ?? notice}</div>
      </div>

      {progress.portfolio.length > 0 && (
        <div className="portfolio-list"><h3>{translate(locale, 'portfolio')}</h3>{progress.portfolio.slice(0, 4).map((entry) => <article key={entry.id}><div><strong>{entry.theme}</strong><span>{entry.format} · {entry.focus}</span></div><p>{entry.reflection}</p></article>)}</div>
      )}
    </section>
  )
}

function PetCard({
  pet,
  role,
  accept = 'image/jpeg,image/png,image/webp',
  testId,
  locale,
  onFile,
}: {
  pet: PetView
  role: string
  accept?: string
  testId?: string
  locale: Locale
  onFile?: (file: File | undefined) => void | Promise<void>
}) {
  return (
    <article className="pet-card" data-testid={testId}>
      <div className="pet-summon-stage" aria-hidden="true">
        <div className="summon-beam" />
        <div className="summon-circle" />
        <img
          key={pet.imageUrl}
          className="pet-visual"
          src={pet.imageUrl}
          alt=""
        />
        <div className="summon-sparks" />
        <div className="summon-front-arc" />
      </div>
      <div className="pet-card-content">
        <div className="pet-role">{role}</div><h3>{pet.name}</h3><p>{pet.description}</p>
        {onFile && <label className="upload-button">{translate(locale, 'artifactChoose')}<input className="file-input" type="file" accept={accept} onChange={(event) => { void onFile(event.target.files?.[0]) }} /></label>}
      </div>
    </article>
  )
}

function PetCoreVisualizer({ pet, level, essenceCapacity, locale }: { pet: PetView; level: number; essenceCapacity: number; locale: Locale }) {
  const center = { x: 120, y: 116 }
  const axes = {
    physical: { x: 120, y: 22 },
    magic: { x: 214, y: 184 },
    defense: { x: 26, y: 184 },
  }
  const point = (axis: { x: number; y: number }, value: number) => {
    const ratio = Math.max(0.08, Math.min(1, value / 120))
    return `${(center.x + (axis.x - center.x) * ratio).toFixed(1)},${(center.y + (axis.y - center.y) * ratio).toFixed(1)}`
  }
  const radarPoints = [
    point(axes.physical, pet.stats.physical),
    point(axes.magic, pet.stats.magic),
    point(axes.defense, pet.stats.defense),
  ].join(' ')

  return (
    <article className="core-visualizer" data-testid="player-core-visualizer" aria-label={translate(locale, 'petParameters')}>
      <div className="core-visualizer-heading">
        <div><span>PET CORE SCAN</span><h3>{translate(locale, 'parameterAnalysis')}</h3></div>
        <div className="core-level-indicator"><i /> LEVEL {level}</div>
      </div>
      <div className="core-visualizer-grid">
        <div className="core-radar-wrap">
          <svg className="core-radar" viewBox="0 0 240 220" role="img" aria-label={`${translate(locale, 'physical')} ${pet.stats.physical}, ${translate(locale, 'magic')} ${pet.stats.magic}, ${translate(locale, 'defense')} ${pet.stats.defense}`}>
            <defs>
              <linearGradient id="core-radar-fill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff957d" />
                <stop offset="0.5" stopColor="#a9a2ff" />
                <stop offset="1" stopColor="#7ce9d3" />
              </linearGradient>
            </defs>
            <polygon className="core-radar-grid" points="120,22 214,184 26,184" />
            <polygon className="core-radar-grid inner" points="120,53 183,161 57,161" />
            <polygon className="core-radar-grid inner" points="120,84 151,139 89,139" />
            <line className="core-radar-axis" x1="120" y1="116" x2="120" y2="22" />
            <line className="core-radar-axis" x1="120" y1="116" x2="214" y2="184" />
            <line className="core-radar-axis" x1="120" y1="116" x2="26" y2="184" />
            <polygon className="core-radar-value" points={radarPoints} />
            <text className="core-radar-label physical" x="120" y="15" textAnchor="middle">{translate(locale, 'physical')}</text>
            <text className="core-radar-label magic" x="224" y="202" textAnchor="end">{translate(locale, 'magic')}</text>
            <text className="core-radar-label defense" x="16" y="202">{translate(locale, 'defense')}</text>
            <text className="core-radar-essence" x="120" y="116" textAnchor="middle">ESS {pet.stats.essence}/{essenceCapacity}</text>
          </svg>
        </div>
        <div className="core-meter-list">
          <CoreMeter label="PHYSICAL" value={pet.stats.physical} className="physical" />
          <CoreMeter label="MAGIC" value={pet.stats.magic} className="magic" />
          <CoreMeter label="DEFENSE" value={pet.stats.defense} className="defense" />
        </div>
      </div>
      <div className="essence-list">
        {pet.traits.map((trait) => <span className="essence-tag" key={trait}>{trait}</span>)}
        {pet.lockedTraits.map((trait) => <span className="essence-tag locked" key={trait}>🔒 {trait.includes('Lv.') ? trait : `${trait} · Lv.${Math.max(2, level + 1)}`}</span>)}
      </div>
    </article>
  )
}

function CoreMeter({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`core-meter ${className}`}>
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="core-meter-track"><i style={{ width: `${Math.min(100, value / 1.2)}%` }} /></div>
    </div>
  )
}

function FighterHud({ name, hp, maxHp, right = false }: { name: string; hp: number; maxHp: number; right?: boolean }) {
  return <div className={`fighter-hud ${right ? 'right' : ''}`}><strong>{name}</strong><div className="hp-track"><div className="hp-fill" style={{ width: `${Math.max(0, hp / maxHp * 100)}%` }} /></div><small>HP {hp} / {maxHp}</small></div>
}

function ActionButton({ action, icon, label, note, disabled, onClick }: { action: BattleAction; icon: string; label: string; note: string; disabled: boolean; onClick: (action: BattleAction) => void }) {
  return <button type="button" className={`action-button ${action}`} disabled={disabled} onClick={() => onClick(action)}><span>{icon} {label}</span><small>{note}</small></button>
}

function makeBattle(left: PetView, right: PetView): BattleState {
  return createBattleState(
    { id: left.id, hp: left.stats.hp, physical: left.stats.physical, magic: left.stats.magic, defense: left.stats.defense },
    { id: right.id, hp: right.stats.hp, physical: right.stats.physical, magic: right.stats.magic, defense: right.stats.defense },
    20260718,
  )
}

function turnLabel(player: BattleAction, cpu: BattleAction, events: ReturnType<typeof resolveTurn>['events'], locale: Locale): string {
  const names: Record<BattleAction, string> = {
    physical: translate(locale, 'physical'),
    magic: translate(locale, 'magic'),
    defense: translate(locale, 'defense'),
  }
  const impact = events.find((event) => event.type === 'counter' || event.type === 'hit')
  const choices = locale === 'ja'
    ? `あなた：${names[player]} ／ 相手：${names[cpu]}`
    : `You: ${names[player]} / Opponent: ${names[cpu]}`
  if (impact?.type === 'counter') return locale === 'ja' ? `${choices} — カウンター ${impact.damage}ダメージ！` : `${choices} — Counter for ${impact.damage} damage!`
  if (impact?.type === 'hit') return locale === 'ja' ? `${choices} — ${impact.damage}ダメージ！` : `${choices} — ${impact.damage} damage!`
  return locale === 'ja' ? `${choices} — 防御が拮抗。` : `${choices} — Defenses are evenly matched.`
}

function actionName(action: BattleAction, locale: Locale): string {
  return translate(locale, action)
}

function onlineStatusLabel(status: OnlineStatus, locale: Locale): string {
  if (locale === 'en') {
    return {
      idle: 'OFFLINE', connecting: 'CONNECTING', connected: 'CONNECTED', waiting: 'READY · WAITING',
      active: 'ONLINE', 'action-locked': 'ACTION LOCKED', disconnected: 'DISCONNECTED', error: 'NETWORK ERROR',
    }[status]
  }
  const labels: Record<OnlineStatus, string> = {
    idle: '未接続',
    connecting: '接続中',
    connected: '接続済み',
    waiting: 'READY・待機中',
    active: 'ONLINE',
    'action-locked': '行動確定・待機中',
    disconnected: '切断',
    error: '通信エラー',
  }
  return labels[status]
}

function arenaEventFromBattleEvents(
  events: readonly BattleEvent[],
  localPlayerId: string,
): ArenaEvent | undefined {
  const impact = events.find(
    (event) => event.type === 'counter' || event.type === 'hit' || event.type === 'guard',
  )
  if (!impact) return undefined
  if (impact.type === 'guard') {
    return {
      id: `guard-${impact.turn}-${Date.now()}`,
      type: 'defense',
      actor: impact.combatantIds.includes(localPlayerId) ? 'left' : 'right',
    }
  }
  return {
    id: `${impact.type}-${impact.turn}-${Date.now()}`,
    type: impact.type === 'counter' ? 'counter' : impact.action,
    actor: impact.sourceId === localPlayerId ? 'left' : 'right',
  }
}

function onlineTurnLabel(
  events: readonly BattleEvent[],
  localPlayerId: string,
  locale: Locale,
): string {
  const revealed = events.find((event) => event.type === 'actionsRevealed')
  const localAction = revealed?.type === 'actionsRevealed'
    ? revealed.actions[localPlayerId]
    : undefined
  const opponentAction = revealed?.type === 'actionsRevealed'
    ? Object.entries(revealed.actions).find(([id]) => id !== localPlayerId)?.[1]
    : undefined
  const choices = localAction && opponentAction
    ? locale === 'ja'
      ? `あなた：${actionName(localAction, locale)} ／ 相手：${actionName(opponentAction, locale)}`
      : `You: ${actionName(localAction, locale)} / Opponent: ${actionName(opponentAction, locale)}`
    : locale === 'ja' ? '双方の行動を公開' : 'Both actions revealed'
  const impact = events.find(
    (event) => event.type === 'counter' || event.type === 'hit',
  )
  if (impact?.type === 'counter') {
    const owner = impact.sourceId === localPlayerId
      ? locale === 'ja' ? 'あなた' : 'You'
      : locale === 'ja' ? '相手' : 'Opponent'
    return locale === 'ja' ? `${choices} — ${owner}のカウンター、${impact.damage}ダメージ！` : `${choices} — ${owner} countered for ${impact.damage} damage!`
  }
  if (impact?.type === 'hit') {
    const owner = impact.sourceId === localPlayerId
      ? locale === 'ja' ? 'あなた' : 'You'
      : locale === 'ja' ? '相手' : 'Opponent'
    return locale === 'ja' ? `${choices} — ${owner}の攻撃、${impact.damage}ダメージ！` : `${choices} — ${owner} dealt ${impact.damage} damage!`
  }
  return locale === 'ja' ? `${choices} — 防御が拮抗。` : `${choices} — Defenses are evenly matched.`
}

function randomCode(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined') crypto.getRandomValues(bytes)
  else for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('')
}

function createRoomId(): string {
  return `ARENA-${randomCode(6)}`
}

function getSessionPlayerId(): string {
  const key = 'petbattle-player-id'
  try {
    const existing = sessionStorage.getItem(key)
    if (existing && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) return existing
    const created = `P-${randomCode(6)}`
    sessionStorage.setItem(key, created)
    return created
  } catch {
    return `P-${randomCode(6)}`
  }
}

const traitLabelsJa: Record<PetManifest['analysis']['traits'][number], string> = {
  swift: '俊敏', sturdy: '堅牢', arcane: '秘術', radiant: '発光', fierce: '獰猛', mysterious: '神秘', balanced: '均衡',
}

const traitLabelsEn: Record<PetManifest['analysis']['traits'][number], string> = {
  swift: 'Swift', sturdy: 'Sturdy', arcane: 'Arcane', radiant: 'Radiant', fierce: 'Fierce', mysterious: 'Mysterious', balanced: 'Balanced',
}

const elementLabelsJa: Record<PetManifest['analysis']['element'], string> = {
  neutral: '無', fire: '炎', water: '水', wind: '風', earth: '地', light: '光', shadow: '影',
}

const elementLabelsEn: Record<PetManifest['analysis']['element'], string> = {
  neutral: 'Neutral', fire: 'Fire', water: 'Water', wind: 'Wind', earth: 'Earth', light: 'Light', shadow: 'Shadow',
}

const elementColors: Record<PetManifest['analysis']['element'], string> = {
  neutral: '#d7d9e0', fire: '#ff7147', water: '#65cfff', wind: '#7ce9d3', earth: '#d8b06a', light: '#fff09a', shadow: '#b391ff',
}

function manifestToPetView(manifest: PetManifest, imageUrl: string, locale: Locale): PetView {
  const { analysis, stats, features } = manifest
  const essence = analysis.essence
  const traitLabels = locale === 'ja' ? traitLabelsJa : traitLabelsEn
  const elementLabels = locale === 'ja' ? elementLabelsJa : elementLabelsEn
  const element = elementLabels[analysis.element]
  return {
    id: 'player',
    name: analysis.name,
    description: locale === 'ja'
      ? `${element}属性の${analysis.species} · ${manifest.analysisSource === 'luna' ? 'Luna認識' : 'ローカル認識'}`
      : `${element} ${analysis.species} · ${manifest.analysisSource === 'luna' ? 'Luna analysis' : 'Local analysis'}`,
    imageUrl,
    traits: [
      locale === 'ja' ? `${element}属性` : `${element} element`,
      ...analysis.traits.map((trait) => traitLabels[trait]),
      `${translate(locale, 'physical')} ESS ${essence.physical}`,
      `${translate(locale, 'magic')} ESS ${essence.magic}`,
      `${translate(locale, 'defense')} ESS ${essence.defense}`,
    ],
    lockedTraits: locale === 'ja'
      ? features.entropy > 600 ? ['高次構造', '動的表現'] : ['意味関係', 'ベクター構造']
      : features.entropy > 600 ? ['Higher-order structure', 'Dynamic expression'] : ['Semantic relations', 'Vector structure'],
    stats: { ...stats, essence: essence.physical + essence.magic + essence.defense },
    accentColor: elementColors[analysis.element],
  }
}

function levelUnlockLabel(level: number, locale: Locale): string {
  const keys = ['unlockRaster', 'unlockSvg', 'unlockCode', 'unlock3d', 'unlockStructure'] as const
  return translate(locale, keys[Math.max(1, Math.min(5, level)) - 1])
}

function levelLearningLabel(level: number, locale: Locale): string {
  const keys = ['learnRaster', 'learnSvg', 'learnCode', 'learn3d', 'learnStructure'] as const
  return translate(locale, keys[Math.max(1, Math.min(5, level)) - 1])
}

export default App
