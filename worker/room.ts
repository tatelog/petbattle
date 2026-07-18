import {
  createBattleState,
  resolveTurn,
  type BattleAction,
  type BattleState,
  type CombatantInput,
} from '../src/core/battle'
import type {
  PetBattleStats,
  RoomClientMessage,
  RoomServerMessage,
} from '../src/api/room'

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}

export interface DurableObjectStateLike {
  readonly storage: DurableObjectStorageLike
  acceptWebSocket(socket: WebSocket): void
  getWebSockets(): WebSocket[]
  blockConcurrencyWhile?<T>(callback: () => Promise<T>): Promise<T>
}

export interface BattleRoomEnv {}

interface SocketAttachment {
  readonly playerId: string
}

type RoomSocket = WebSocket & {
  serializeAttachment?(attachment: SocketAttachment): void
  deserializeAttachment?(): unknown
}

interface WebSocketPairValue {
  readonly 0: WebSocket
  readonly 1: RoomSocket
}

interface WebSocketPairConstructor {
  new (): WebSocketPairValue
}

declare const WebSocketPair: WebSocketPairConstructor

interface StoredPlayer {
  readonly id: string
  readonly stats: PetBattleStats | null
}

interface StoredRoom {
  readonly roomId: string | null
  readonly players: readonly StoredPlayer[]
  readonly battleState: BattleState | null
  readonly pendingActions: Readonly<Record<string, BattleAction>>
}

const STORAGE_KEY = 'room'
const MAX_MESSAGE_CHARS = 2_048
const MAX_PLAYER_ID_CHARS = 64
// Lv.1の通常値を十分に含めつつ、改変クライアントによる極端な能力値を拒否する。
// 正式ランキングでは署名済みManifestから能力値を復元する。
const MAX_STAT = 512

function emptyRoom(): StoredRoom {
  return {
    roomId: null,
    players: [],
    battleState: null,
    pendingActions: {},
  }
}

export class BattleRoom {
  private readonly state: DurableObjectStateLike
  private room: StoredRoom = emptyRoom()
  private readonly sockets = new Map<RoomSocket, string>()
  private readonly initialized: Promise<void>

  constructor(state: DurableObjectStateLike, _env: BattleRoomEnv) {
    this.state = state
    const initialize = async (): Promise<void> => this.initialize()
    this.initialized = state.blockConcurrencyWhile
      ? state.blockConcurrencyWhile(initialize)
      : initialize()
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialized

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return roomError(426, 'upgrade_required', 'WebSocket接続が必要です')
    }

    const url = new URL(request.url)
    const roomId = roomIdFromPath(url.pathname)
    const playerId = url.searchParams.get('playerId') ?? ''
    if (!roomId) {
      return roomError(400, 'invalid_room', '部屋IDが不正です')
    }
    if (!isValidPlayerId(playerId)) {
      return roomError(400, 'invalid_player', 'プレイヤーIDが不正です')
    }
    if (this.room.roomId !== null && this.room.roomId !== roomId) {
      return roomError(409, 'room_mismatch', '部屋IDが一致しません')
    }

    const knownPlayer = this.room.players.some((player) => player.id === playerId)
    if (!knownPlayer && this.room.players.length >= 2) {
      return roomError(409, 'room_full', 'この部屋は満員です')
    }

    for (const [socket, connectedPlayerId] of this.sockets) {
      if (connectedPlayerId === playerId) {
        this.sockets.delete(socket)
        socket.close(4001, 'Reconnected from another socket')
      }
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.serializeAttachment?.({ playerId })
    this.state.acceptWebSocket(server)
    this.sockets.set(server, playerId)

    if (!knownPlayer) {
      this.room = {
        ...this.room,
        roomId,
        players: [...this.room.players, { id: playerId, stats: null }],
      }
      await this.persist()
    }

    this.send(server, { type: 'connected', roomId, playerId })
    this.broadcastPresence()
    if (this.room.battleState !== null) {
      // Durable Object休止・回線断から戻った既存プレイヤーへ、現在の正本を再同期する。
      this.send(server, { type: 'battleStarted', state: this.room.battleState })
      if (this.room.pendingActions[playerId] !== undefined) {
        this.send(server, {
          type: 'actionAccepted',
          turn: this.room.battleState.turn,
        })
      }
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket })
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    await this.initialized
    const roomSocket = socket as RoomSocket
    const playerId = this.playerIdFor(roomSocket)
    if (!playerId) {
      socket.close(4003, 'Unknown player')
      return
    }
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_CHARS) {
      this.sendError(roomSocket, 'invalid_message', 'JSONメッセージが不正です')
      return
    }

    let candidate: unknown
    try {
      candidate = JSON.parse(message)
    } catch {
      this.sendError(roomSocket, 'invalid_json', 'JSONを読み取れませんでした')
      return
    }

    if (!isClientMessage(candidate)) {
      this.sendError(roomSocket, 'invalid_message', '未対応のメッセージです')
      return
    }
    if (candidate.type === 'ready') {
      await this.handleReady(roomSocket, playerId, candidate.stats)
      return
    }
    await this.handleAction(roomSocket, playerId, candidate.action)
  }

  async webSocketClose(
    socket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    await this.initialized
    this.handleDisconnect(socket as RoomSocket)
  }

  async webSocketError(socket: WebSocket, _error: unknown): Promise<void> {
    await this.initialized
    this.handleDisconnect(socket as RoomSocket)
  }

  private async initialize(): Promise<void> {
    this.room = (await this.state.storage.get<StoredRoom>(STORAGE_KEY)) ?? emptyRoom()
    let changed = false
    for (const socket of this.state.getWebSockets() as RoomSocket[]) {
      const attachment = socket.deserializeAttachment?.()
      const playerId = playerIdFromAttachment(attachment)
      if (!playerId) continue
      this.sockets.set(socket, playerId)
      if (!this.room.players.some((player) => player.id === playerId)) {
        this.room = {
          ...this.room,
          players: [...this.room.players, { id: playerId, stats: null }],
        }
        changed = true
      }
    }
    if (changed) await this.persist()
  }

  private async handleReady(
    socket: RoomSocket,
    playerId: string,
    stats: PetBattleStats,
  ): Promise<void> {
    if (this.room.battleState !== null) {
      this.sendError(socket, 'battle_started', 'バトルはすでに開始しています')
      return
    }
    if (!isValidStats(stats)) {
      this.sendError(socket, 'invalid_stats', 'PET能力値が不正です')
      return
    }

    this.room = {
      ...this.room,
      players: this.room.players.map((player) =>
        player.id === playerId ? { ...player, stats: { ...stats } } : player,
      ),
    }
    await this.persist()
    this.broadcastPresence()

    const readyPlayers = this.room.players.filter(
      (player): player is StoredPlayer & { stats: PetBattleStats } =>
        player.stats !== null,
    )
    if (readyPlayers.length !== 2) return

    const seedBuffer = new Uint32Array(1)
    crypto.getRandomValues(seedBuffer)
    const [first, second] = readyPlayers
    const battleState = createBattleState(
      toCombatant(first),
      toCombatant(second),
      seedBuffer[0],
    )
    this.room = { ...this.room, battleState }
    await this.persist()
    this.broadcast({ type: 'battleStarted', state: battleState })
  }

  private async handleAction(
    socket: RoomSocket,
    playerId: string,
    action: BattleAction,
  ): Promise<void> {
    const battleState = this.room.battleState
    if (battleState === null || battleState.status !== 'active') {
      this.sendError(socket, 'battle_inactive', '進行中のバトルがありません')
      return
    }
    if (!battleState.combatants.some((combatant) => combatant.id === playerId)) {
      this.sendError(socket, 'not_combatant', 'このバトルには参加していません')
      return
    }
    if (this.room.pendingActions[playerId] !== undefined) {
      this.sendError(socket, 'action_locked', 'このターンの行動は確定済みです')
      return
    }

    const pendingActions = {
      ...this.room.pendingActions,
      [playerId]: action,
    }
    this.room = { ...this.room, pendingActions }
    await this.persist()
    this.send(socket, { type: 'actionAccepted', turn: battleState.turn })

    const [first, second] = battleState.combatants
    if (
      pendingActions[first.id] === undefined ||
      pendingActions[second.id] === undefined
    ) {
      return
    }

    const resolution = resolveTurn(battleState, pendingActions)
    this.room = {
      ...this.room,
      battleState: resolution.state,
      pendingActions: {},
    }
    await this.persist()

    // 1回だけserializeし、全クライアントへ同一のイベント列を送る。
    this.broadcast({
      type: 'turnResolved',
      state: resolution.state,
      events: resolution.events,
    })
  }

  private handleDisconnect(socket: RoomSocket): void {
    const playerId = this.sockets.get(socket)
    if (!playerId) return
    this.sockets.delete(socket)
    this.broadcast({ type: 'opponentDisconnected', playerId })
    this.broadcastPresence()
  }

  private playerIdFor(socket: RoomSocket): string | undefined {
    const connected = this.sockets.get(socket)
    if (connected) return connected
    const fromAttachment = playerIdFromAttachment(
      socket.deserializeAttachment?.(),
    )
    if (fromAttachment) this.sockets.set(socket, fromAttachment)
    return fromAttachment
  }

  private broadcastPresence(): void {
    const connectedIds = new Set(this.sockets.values())
    this.broadcast({
      type: 'presence',
      players: this.room.players.map((player) => ({
        id: player.id,
        ready: player.stats !== null,
        connected: connectedIds.has(player.id),
      })),
    })
  }

  private broadcast(message: RoomServerMessage): void {
    const serialized = JSON.stringify(message)
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(serialized)
      } catch {
        // close/error callbackで接続状態を整理する。
      }
    }
  }

  private send(socket: RoomSocket, message: RoomServerMessage): void {
    socket.send(JSON.stringify(message))
  }

  private sendError(socket: RoomSocket, code: string, message: string): void {
    this.send(socket, { type: 'error', code, message })
  }

  private async persist(): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, this.room)
  }
}

function toCombatant(player: StoredPlayer & { stats: PetBattleStats }): CombatantInput {
  return { id: player.id, ...player.stats }
}

function roomError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function roomIdFromPath(pathname: string): string | null {
  const match = /^\/room\/([^/]+)$/.exec(pathname)
  if (!match) return null
  try {
    const roomId = decodeURIComponent(match[1]!)
    return /^[A-Za-z0-9_-]{3,64}$/.test(roomId) ? roomId : null
  } catch {
    return null
  }
}

function isValidPlayerId(playerId: string): boolean {
  return (
    playerId.length > 0 &&
    playerId.length <= MAX_PLAYER_ID_CHARS &&
    /^[A-Za-z0-9_-]+$/.test(playerId)
  )
}

function playerIdFromAttachment(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('playerId' in value)) {
    return undefined
  }
  const playerId = (value as { playerId?: unknown }).playerId
  return typeof playerId === 'string' && isValidPlayerId(playerId)
    ? playerId
    : undefined
}

function isValidStats(value: unknown): value is PetBattleStats {
  if (typeof value !== 'object' || value === null) return false
  const stats = value as Partial<Record<keyof PetBattleStats, unknown>>
  return (
    isValidStat(stats.hp, 1) &&
    isValidStat(stats.physical, 0) &&
    isValidStat(stats.magic, 0) &&
    isValidStat(stats.defense, 0)
  )
}

function isValidStat(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= MAX_STAT
  )
}

function isClientMessage(value: unknown): value is RoomClientMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false
  }
  const message = value as { type?: unknown; stats?: unknown; action?: unknown }
  if (message.type === 'ready') return isValidStats(message.stats)
  return (
    message.type === 'action' &&
    (message.action === 'physical' ||
      message.action === 'magic' ||
      message.action === 'defense')
  )
}
