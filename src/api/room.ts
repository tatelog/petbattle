import type {
  BattleAction,
  BattleEvent,
  BattleState,
  CombatantInput,
} from '../core/battle'

export type PetBattleStats = Omit<CombatantInput, 'id'>

export type RoomClientMessage =
  | { readonly type: 'ready'; readonly stats: PetBattleStats }
  | { readonly type: 'action'; readonly action: BattleAction }

export type RoomServerMessage =
  | {
      readonly type: 'connected'
      readonly roomId: string
      readonly playerId: string
    }
  | {
      readonly type: 'presence'
      readonly players: readonly {
        readonly id: string
        readonly ready: boolean
        readonly connected: boolean
      }[]
    }
  | {
      readonly type: 'battleStarted'
      readonly state: BattleState
    }
  | {
      readonly type: 'actionAccepted'
      readonly turn: number
    }
  | {
      readonly type: 'turnResolved'
      readonly state: BattleState
      readonly events: readonly BattleEvent[]
    }
  | {
      readonly type: 'opponentDisconnected'
      readonly playerId: string
    }
  | {
      readonly type: 'error'
      readonly code: string
      readonly message: string
    }

export interface RoomConnectionOptions {
  /** Workerの公開URL。例: https://petbattle.example.workers.dev */
  readonly workerUrl: string
  readonly roomId: string
  readonly playerId: string
  /** テストやReact Native等でWebSocket実装を差し替えるための入口。 */
  readonly createSocket?: (url: string) => WebSocket
}

export interface RoomConnection {
  readonly socket: WebSocket
  ready(stats: PetBattleStats): void
  action(action: BattleAction): void
  subscribe(listener: (message: RoomServerMessage) => void): () => void
  close(code?: number, reason?: string): void
}

const WEBSOCKET_CONNECTING = 0
const WEBSOCKET_OPEN = 1

export function connectRoom(options: RoomConnectionOptions): RoomConnection {
  const url = roomWebSocketUrl(
    options.workerUrl,
    options.roomId,
    options.playerId,
  )
  const socket = options.createSocket
    ? options.createSocket(url)
    : new WebSocket(url)
  const listeners = new Set<(message: RoomServerMessage) => void>()
  const queued: string[] = []

  const onOpen = (): void => {
    for (const message of queued.splice(0)) socket.send(message)
  }
  const onMessage = (event: MessageEvent): void => {
    if (typeof event.data !== 'string') return
    let candidate: unknown
    try {
      candidate = JSON.parse(event.data)
    } catch {
      return
    }
    if (!isRoomServerMessage(candidate)) return
    for (const listener of listeners) listener(candidate)
  }
  socket.addEventListener('open', onOpen)
  socket.addEventListener('message', onMessage)

  const send = (message: RoomClientMessage): void => {
    const serialized = JSON.stringify(message)
    if (socket.readyState === WEBSOCKET_OPEN) {
      socket.send(serialized)
    } else if (socket.readyState === WEBSOCKET_CONNECTING) {
      queued.push(serialized)
    } else {
      throw new Error('Battle room WebSocket is not open.')
    }
  }

  return {
    socket,
    ready(stats) {
      send({ type: 'ready', stats })
    },
    action(action) {
      send({ type: 'action', action })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close(code, reason) {
      queued.length = 0
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('message', onMessage)
      socket.close(code, reason)
    },
  }
}

export function roomWebSocketUrl(
  workerUrl: string,
  roomId: string,
  playerId: string,
): string {
  const url = new URL(workerUrl)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  else if (url.protocol === 'http:') url.protocol = 'ws:'
  else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new TypeError('workerUrlはHTTP(S)またはWS(S) URLにしてください')
  }
  url.pathname = `/room/${encodeURIComponent(roomId)}`
  url.search = new URLSearchParams({ playerId }).toString()
  url.hash = ''
  return url.toString()
}

function isRoomServerMessage(value: unknown): value is RoomServerMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false
  }
  const type = (value as { type?: unknown }).type
  return (
    type === 'connected' ||
    type === 'presence' ||
    type === 'battleStarted' ||
    type === 'actionAccepted' ||
    type === 'turnResolved' ||
    type === 'opponentDisconnected' ||
    type === 'error'
  )
}
