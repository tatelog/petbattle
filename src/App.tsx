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
  const [phase, setPhase] = useState<AppPhase>('summon')
  const [battleMode, setBattleMode] = useState<BattleMode>('local')
  const [leftPet, setLeftPet] = useState<PetView>(demoLeft)
  const [rightPet] = useState<PetView>(demoRight)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [message, setMessage] = useState(
    lunaConfigured
      ? 'サンプルPETです。好きな画像へ差し替えられます。'
      : 'APIなしのローカルモードです。画像解析からCPUバトルまでそのまま遊べます。',
  )
  const [error, setError] = useState<string | null>(null)
  const [battle, setBattle] = useState<BattleState>(() => makeBattle(demoLeft, demoRight))
  const [arenaEvent, setArenaEvent] = useState<ArenaEvent | undefined>()
  const [introKey, setIntroKey] = useState(0)
  const [introDone, setIntroDone] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [battleLog, setBattleLog] = useState('鳥瞰カメラからコロシアムへ降下します。')
  const [roomId, setRoomId] = useState(() => createRoomId())
  const [playerId, setPlayerId] = useState(() => getSessionPlayerId())
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('idle')
  const [onlineNotice, setOnlineNotice] = useState('ルームへ接続すると、PET能力値をREADYできます。')
  const [onlineOpponentId, setOnlineOpponentId] = useState<string | null>(null)
  const [onlineActionPending, setOnlineActionPending] = useState(false)
  const [isArenaFullscreen, setIsArenaFullscreen] = useState(false)
  const arenaPanelRef = useRef<HTMLElement | null>(null)
  const roomConnectionRef = useRef<RoomConnection | null>(null)
  const roomCleanupRef = useRef<(() => void) | null>(null)
  const onlineBattleStartedRef = useRef(false)
  const koTimerRef = useRef<number | null>(null)

  const reducedMotion = useMemo(
    () => {
      const override = new URLSearchParams(window.location.search).get('motion')
      if (override === 'full') return false
      if (override === 'reduced') return true
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    },
    [],
  )

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

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
      setBattleLog('BATTLE START — 行動を選択してください。')
    }, reducedMotion ? 20 : 5_600)
    return () => window.clearTimeout(timer)
  }, [introDone, introKey, phase, reducedMotion])

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

  function chooseFile(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Lv.1で召喚できる形式はJPEG・PNG・WebPです。')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Lv.1のファイル上限は2 MiBです。')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const nextUrl = URL.createObjectURL(file)
    setSelectedFile(file)
    setPreviewUrl(nextUrl)
    setLeftPet((current) => ({
      ...current,
      name: file.name.replace(/\.[^.]+$/, '') || 'Unknown Artifact',
      description: '解析待ちのデジタル表現',
      imageUrl: nextUrl,
    }))
    setError(null)
    setMessage('画像を読み込みました。「意味を解析」を実行してください。')
  }

  async function analyzeSelected() {
    if (!selectedFile) {
      setMessage('サンプルPETの解析済みデータを使用します。')
      return
    }
    setIsAnalyzing(true)
    setError(null)
    try {
      const localManifest = await analyzeImageFile(selectedFile)
      let manifest = localManifest
      let analysisMessage = 'ローカル解析で16個の有効エッセンスを生成しました。'
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
          analysisMessage = 'GPT-5.6 Lunaが意味を認識し、固定ルールで能力値へ変換しました。'
        } catch (lunaError) {
          analysisMessage = `${lunaError instanceof Error ? lunaError.message : 'Luna解析に失敗しました'}。ローカル解析を使用します。`
        }
      }
      const analyzed = manifestToPetView(manifest, leftPet.imageUrl)
      setLeftPet(analyzed)
      setMessage(analysisMessage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '画像解析に失敗しました。')
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
    setIntroKey((key) => key + 1)
    setPhase('battle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startLocalBattle() {
    enterArena(
      makeBattle(leftPet, rightPet),
      '召喚シーケンス開始。コロシアムへ降下中…',
    )
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
      setBattleLog('全画面表示を開始できませんでした。ブラウザの全画面設定を確認してください。')
    }
  }

  function selectBattleMode(nextMode: BattleMode) {
    if (nextMode === battleMode) return
    if (battleMode === 'online') disconnectOnline(true)
    setBattleMode(nextMode)
    setOnlineStatus('idle')
    setOnlineActionPending(false)
    setOnlineOpponentId(null)
    setOnlineNotice('ルームへ接続すると、PET能力値をREADYできます。')
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
      setOnlineNotice('ルームから切断しました。再接続できます。')
    }
  }

  function connectOnline() {
    if (!onlineConfigured) {
      setOnlineStatus('error')
      setOnlineNotice('VITE_BATTLE_WORKER_URLを設定すると通信対戦を利用できます。')
      return
    }
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(roomId)) {
      setOnlineStatus('error')
      setOnlineNotice('ルームIDは半角英数字・_・-で3〜64文字にしてください。')
      return
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(playerId)) {
      setOnlineStatus('error')
      setOnlineNotice('プレイヤーIDは半角英数字・_・-で1〜64文字にしてください。')
      return
    }

    clearRoomConnection()
    onlineBattleStartedRef.current = false
    setOnlineOpponentId(null)
    setOnlineActionPending(false)
    setOnlineStatus('connecting')
    setOnlineNotice('通信コロシアムへ接続しています…')

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
        setOnlineNotice('サーバーとの接続が切れました。再接続してください。')
      }
      const handleSocketError = () => {
        setOnlineStatus('error')
        setOnlineNotice('通信エラーが発生しました。Worker URLとネットワークを確認してください。')
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
      setOnlineNotice(cause instanceof Error ? cause.message : '通信対戦へ接続できませんでした。')
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
      setOnlineNotice('READYを送信しました。相手の接続とREADYを待っています。')
    } catch (cause) {
      setOnlineStatus('error')
      setOnlineNotice(cause instanceof Error ? cause.message : 'READYを送信できませんでした。')
    }
  }

  function handleOnlineMessage(nextMessage: RoomServerMessage, expectedPlayerId: string) {
    if (nextMessage.type === 'connected') {
      setOnlineStatus('connected')
      setOnlineNotice(`ROOM ${nextMessage.roomId} に接続しました。PETをREADYしてください。`)
      return
    }
    if (nextMessage.type === 'presence') {
      const local = nextMessage.players.find((player) => player.id === expectedPlayerId)
      const opponent = nextMessage.players.find((player) => player.id !== expectedPlayerId)
      setOnlineOpponentId(opponent?.id ?? null)
      if (onlineBattleStartedRef.current) {
        if (opponent?.connected) {
          setOnlineStatus((current) => current === 'action-locked' ? current : 'active')
          setOnlineNotice('2人の接続を確認。サーバー権威でターンを同期中です。')
        } else {
          setOnlineStatus('disconnected')
          setOnlineNotice('対戦相手との接続が切れました。再接続を待っています。')
        }
      } else if (local?.ready) {
        setOnlineStatus('waiting')
        setOnlineNotice(opponent?.ready
          ? '双方READY。バトル状態を同期しています…'
          : 'あなたはREADYです。対戦相手を待っています。')
      } else {
        setOnlineStatus('connected')
      }
      return
    }
    if (nextMessage.type === 'battleStarted') {
      if (!nextMessage.state.combatants.some((combatant) => combatant.id === expectedPlayerId)) {
        setOnlineStatus('error')
        setOnlineNotice('受信したバトル状態に自分のPETが存在しません。')
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
        ? '終了済みのバトル状態をサーバーから復元しました。'
        : '対戦開始。行動は双方が揃うまで相手へ公開されません。')
      enterArena(
        nextMessage.state,
        nextMessage.state.status === 'finished'
          ? '通信同期完了。最終結果を復元しました。'
          : '通信同期完了。コロシアムへ降下中…',
      )
      if (nextMessage.state.status === 'finished') setShowResult(true)
      return
    }
    if (nextMessage.type === 'actionAccepted') {
      setOnlineActionPending(true)
      setOnlineStatus('action-locked')
      setOnlineNotice(`TURN ${nextMessage.turn} の行動を秘密状態で確定しました。`)
      setBattleLog('行動を確定しました。対戦相手の選択を待っています…')
      return
    }
    if (nextMessage.type === 'turnResolved') {
      setBattle(nextMessage.state)
      setOnlineActionPending(false)
      setOnlineStatus('active')
      setOnlineNotice('双方の行動をサーバーが判定しました。')
      const nextArenaEvent = arenaEventFromBattleEvents(
        nextMessage.events,
        expectedPlayerId,
      )
      if (nextArenaEvent) setArenaEvent(nextArenaEvent)
      setBattleLog(onlineTurnLabel(nextMessage.events, expectedPlayerId))
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
      setOnlineNotice(`${nextMessage.playerId} が切断しました。再接続を待っています。`)
      setBattleLog('対戦相手が切断しました。ターンを一時停止しています。')
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
        setOnlineActionPending(true)
        setOnlineStatus('action-locked')
        setBattleLog(`${actionName(playerAction)}を秘密状態で送信中…`)
      } catch (cause) {
        setOnlineActionPending(false)
        setOnlineStatus('error')
        setOnlineNotice(cause instanceof Error ? cause.message : '行動を送信できませんでした。')
      }
      return
    }
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
    setBattleLog(turnLabel(playerAction, cpuAction, result.events))

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

  function backToLab() {
    if (battleMode === 'online') {
      disconnectOnline(true)
      setOnlineStatus('idle')
      setRoomId(createRoomId())
      setOnlineNotice('新しいルームを作成しました。接続後にPETをREADYできます。')
    }
    setPhase('summon')
    setShowResult(false)
    setArenaEvent(undefined)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeStep = phase === 'summon' ? 1 : showResult ? 4 : 3

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
        <div className="build-badge">OPENAI BUILD WEEK · PROTOTYPE</div>
      </header>

      <main className="app-main">
        {phase === 'summon' && (
          <div className="hero-copy">
            <div className="eyebrow">ANYTHING CAN ENTER THE ARENA</div>
            <h1>あらゆる表現を、<br /><span>戦える存在へ。</span></h1>
            <p>画像を意味エッセンスへ変換し、3Dコロシアムへ召喚。大量に生成した人ではなく、意味のある表現を作れる人が強くなる。</p>
          </div>
        )}

        <div className="stepper" aria-label="進行状況">
          {['召喚', '意味解析', '3Dバトル', '進化'].map((label, index) => {
            const step = index + 1
            return <span key={label} className={`step-chip ${step === activeStep ? 'active' : step < activeStep ? 'done' : ''}`}>{step}. {label}</span>
          })}
        </div>

        {phase === 'summon' ? (
          <section className="panel summon-panel">
            <div className="panel-heading">
              <div><h2>召喚ラボ</h2><p>Lv.1はJPEG・PNG・WebP、2 MiB、16エッセンスまで。</p></div>
              <div className="runtime-badges">
                <div className={`runtime-pill ${lunaConfigured ? 'connected' : 'local'}`}>
                  <i aria-hidden="true" />
                  {lunaConfigured ? 'LOCAL + LUNA' : 'API不要 · LOCAL MODE'}
                </div>
                <div className="level-pill">CORE LEVEL 1</div>
              </div>
            </div>
            <div className="summon-grid">
              <PetCard pet={leftPet} role="YOUR ARTIFACT" onFile={chooseFile} />
              <PetCoreVisualizer pet={leftPet} />
            </div>
            <button className="secondary-button" type="button" onClick={analyzeSelected} disabled={isAnalyzing} style={{ marginTop: 18 }}>
              {isAnalyzing ? '意味を解析中…' : lunaConfigured ? '意味を解析' : 'ローカルで意味を解析'}
            </button>
            <div className="battle-mode-card">
              <div className="battle-mode-heading">
                <div>
                  <strong>対戦モード</strong>
                  <span>LOCAL CPUはAPI不要。通信対戦だけWorker接続を使用します。</span>
                </div>
                <div className="mode-tabs" role="tablist" aria-label="対戦モード">
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
                      <strong>通信Workerが未設定です</strong>
                      <span><code>VITE_BATTLE_WORKER_URL</code> にCloudflare WorkerのURLを設定すると利用できます。ローカルCPU戦はそのまま遊べます。</span>
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
                      aria-label="新しいルームIDを作成"
                      title="新しいルームIDを作成"
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
                    <div><strong>{onlineStatusLabel(onlineStatus)}</strong><small>{onlineNotice}</small></div>
                  </div>
                </div>
              )}
            </div>

            {battleMode === 'local' ? (
              <button className="primary-button" type="button" onClick={startLocalBattle}>CPU戦を3Dコロシアムで開始</button>
            ) : onlineStatus === 'connected' ? (
              <button className="primary-button" type="button" onClick={readyOnlinePet}>このPETをREADY</button>
            ) : onlineStatus === 'waiting' ? (
              <button className="primary-button" type="button" disabled>対戦相手のREADYを待機中…</button>
            ) : onlineStatus === 'connecting' ? (
              <button className="primary-button" type="button" disabled>通信コロシアムへ接続中…</button>
            ) : (
              <button className="primary-button" type="button" disabled={!onlineConfigured} onClick={connectOnline}>
                {onlineStatus === 'disconnected' || onlineStatus === 'error' ? 'ルームへ再接続' : 'ルームへ接続'}
              </button>
            )}
            <div className={`status-message ${error ? 'error' : ''}`}>{error ?? message}</div>
          </section>
        ) : (
          <section ref={arenaPanelRef} className={`panel arena-panel ${isArenaFullscreen ? 'is-fullscreen' : ''}`}>
            <div className="arena-stage">
              <Arena3D
                leftPet={{ name: leftPet.name, imageUrl: leftPet.imageUrl, accentColor: leftPet.accentColor, hp: leftCombatant.hp, maxHp: leftCombatant.maxHp }}
                rightPet={{ name: displayedRightPet.name, imageUrl: displayedRightPet.imageUrl, accentColor: displayedRightPet.accentColor, hp: rightCombatant.hp, maxHp: rightCombatant.maxHp }}
                event={arenaEvent}
                introKey={introKey}
                reducedMotion={reducedMotion}
                onIntroComplete={() => { setIntroDone(true); setBattleLog('BATTLE START — 行動を選択してください。') }}
                onSkipIntro={() => { setIntroDone(true); setBattleLog('BATTLE START — 導入演出をスキップしました。') }}
              />
            </div>
            <div className={`battle-overlay ${introDone ? 'intro-complete' : 'intro-active'}`}>
              <div className="battle-top">
                <FighterHud name={leftPet.name} hp={leftCombatant.hp} maxHp={leftCombatant.maxHp} />
                <div className="turn-stack">
                  <div className="turn-badge">TURN {battle.turn}</div>
                  {battleMode === 'online' && (
                    <div className={`arena-online-state ${onlineStatus}`}>
                      <span className="status-dot" />{onlineStatusLabel(onlineStatus)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="arena-fullscreen-button"
                    aria-label={isArenaFullscreen ? 'バトル画面の全画面表示を終了' : 'バトル画面を全画面表示'}
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
                  <div className="action-bar" aria-label="バトル行動">
                    <ActionButton action="physical" icon="⚔" label="物理" note="魔法を中断" disabled={!introDone || battle.status !== 'active' || (battleMode === 'online' && (onlineActionPending || onlineStatus !== 'active'))} onClick={playTurn} />
                    <ActionButton action="magic" icon="✦" label="魔法" note="防御を貫通" disabled={!introDone || battle.status !== 'active' || (battleMode === 'online' && (onlineActionPending || onlineStatus !== 'active'))} onClick={playTurn} />
                    <ActionButton action="defense" icon="⬡" label="防御" note="物理をカウンター" disabled={!introDone || battle.status !== 'active' || (battleMode === 'online' && (onlineActionPending || onlineStatus !== 'active'))} onClick={playTurn} />
                  </div>
                </div>
              </div>
            </div>
            {battleMode === 'online' && (onlineStatus === 'disconnected' || onlineStatus === 'error') && !showResult && (
              <div className="connection-banner" role="alert">
                <strong>{onlineStatus === 'disconnected' ? 'CONNECTION PAUSED' : 'CONNECTION ERROR'}</strong>
                <span>{onlineNotice}</span>
                <button type="button" onClick={backToLab}>召喚ラボへ戻る</button>
              </div>
            )}
            {showResult && (
              <div className="result-card">
                <div className="trophy">🏆</div>
                <h2>{battle.winnerId === localCombatantId ? `${leftPet.name} WIN` : battle.winnerId === rightCombatant.id ? `${displayedRightPet.name} WIN` : 'DRAW'}</h2>
                <p>バトル経験値を獲得しました。Lv.2ではCore容量が32へ増え、SVGと未解放エッセンスが利用できます。</p>
                <div className="result-actions">
                  <button type="button" className="secondary-button" onClick={backToLab}>召喚ラボへ</button>
                  {battleMode === 'local' && <button type="button" className="secondary-button" onClick={startLocalBattle}>再戦</button>}
                </div>
              </div>
            )}
          </section>
        )}
        <div className="footer-note">PETBATTLE · 意味を理解し、表現を育てるバトルプロトタイプ</div>
      </main>
    </div>
  )
}

function PetCard({
  pet,
  role,
  onFile,
}: {
  pet: PetView
  role: string
  onFile?: (file: File | undefined) => void
}) {
  return (
    <article className="pet-card">
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
        {onFile && <label className="upload-button">画像を選ぶ<input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onFile(event.target.files?.[0])} /></label>}
      </div>
    </article>
  )
}

function PetCoreVisualizer({ pet }: { pet: PetView }) {
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
    <article className="core-visualizer" aria-label="自分のPET Core能力値">
      <div className="core-visualizer-heading">
        <div><span>PET CORE SCAN</span><h3>パラメータ解析</h3></div>
        <div className="core-level-indicator"><i /> LEVEL 1</div>
      </div>
      <div className="core-visualizer-grid">
        <div className="core-radar-wrap">
          <svg className="core-radar" viewBox="0 0 240 220" role="img" aria-label={`物理${pet.stats.physical}、魔法${pet.stats.magic}、防御${pet.stats.defense}`}>
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
            <text className="core-radar-label physical" x="120" y="15" textAnchor="middle">物理</text>
            <text className="core-radar-label magic" x="224" y="202" textAnchor="end">魔法</text>
            <text className="core-radar-label defense" x="16" y="202">防御</text>
            <text className="core-radar-essence" x="120" y="116" textAnchor="middle">ESS {pet.stats.essence}/16</text>
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
        {pet.lockedTraits.map((trait) => <span className="essence-tag locked" key={trait}>🔒 {trait} · Lv.2</span>)}
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

function turnLabel(player: BattleAction, cpu: BattleAction, events: ReturnType<typeof resolveTurn>['events']): string {
  const names: Record<BattleAction, string> = { physical: '物理', magic: '魔法', defense: '防御' }
  const impact = events.find((event) => event.type === 'counter' || event.type === 'hit')
  if (impact?.type === 'counter') return `あなた：${names[player]} ／ 相手：${names[cpu]} — カウンター ${impact.damage}ダメージ！`
  if (impact?.type === 'hit') return `あなた：${names[player]} ／ 相手：${names[cpu]} — ${impact.damage}ダメージ！`
  return `あなた：${names[player]} ／ 相手：${names[cpu]} — 防御が拮抗。`
}

function actionName(action: BattleAction): string {
  return { physical: '物理', magic: '魔法', defense: '防御' }[action]
}

function onlineStatusLabel(status: OnlineStatus): string {
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
): string {
  const revealed = events.find((event) => event.type === 'actionsRevealed')
  const localAction = revealed?.type === 'actionsRevealed'
    ? revealed.actions[localPlayerId]
    : undefined
  const opponentAction = revealed?.type === 'actionsRevealed'
    ? Object.entries(revealed.actions).find(([id]) => id !== localPlayerId)?.[1]
    : undefined
  const choices = localAction && opponentAction
    ? `あなた：${actionName(localAction)} ／ 相手：${actionName(opponentAction)}`
    : '双方の行動を公開'
  const impact = events.find(
    (event) => event.type === 'counter' || event.type === 'hit',
  )
  if (impact?.type === 'counter') {
    const owner = impact.sourceId === localPlayerId ? 'あなた' : '相手'
    return `${choices} — ${owner}のカウンター、${impact.damage}ダメージ！`
  }
  if (impact?.type === 'hit') {
    const owner = impact.sourceId === localPlayerId ? 'あなた' : '相手'
    return `${choices} — ${owner}の攻撃、${impact.damage}ダメージ！`
  }
  return `${choices} — 防御が拮抗。`
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

const traitLabels: Record<PetManifest['analysis']['traits'][number], string> = {
  swift: '俊敏', sturdy: '堅牢', arcane: '秘術', radiant: '発光', fierce: '獰猛', mysterious: '神秘', balanced: '均衡',
}

const elementLabels: Record<PetManifest['analysis']['element'], string> = {
  neutral: '無', fire: '炎', water: '水', wind: '風', earth: '地', light: '光', shadow: '影',
}

const elementColors: Record<PetManifest['analysis']['element'], string> = {
  neutral: '#d7d9e0', fire: '#ff7147', water: '#65cfff', wind: '#7ce9d3', earth: '#d8b06a', light: '#fff09a', shadow: '#b391ff',
}

function manifestToPetView(manifest: PetManifest, imageUrl: string): PetView {
  const { analysis, stats, features } = manifest
  const essence = analysis.essence
  return {
    id: 'player',
    name: analysis.name,
    description: `${elementLabels[analysis.element]}属性の${analysis.species} · ${manifest.analysisSource === 'luna' ? 'Luna認識' : 'ローカル認識'}`,
    imageUrl,
    traits: [
      `${elementLabels[analysis.element]}属性`,
      ...analysis.traits.map((trait) => traitLabels[trait]),
      `物理ESS ${essence.physical}`,
      `魔法ESS ${essence.magic}`,
      `防御ESS ${essence.defense}`,
    ],
    lockedTraits: features.entropy > 600 ? ['高次構造', '動的表現'] : ['意味関係', 'ベクター構造'],
    stats: { ...stats, essence: essence.physical + essence.magic + essence.defense },
    accentColor: elementColors[analysis.element],
  }
}

export default App
