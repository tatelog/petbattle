import { describe, expect, it } from 'vitest'
import type { RoomServerMessage } from '../src/api/room'
import {
  BattleRoom,
  type DurableObjectStateLike,
} from './room'

class MemoryStorage {
  private readonly values = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value))
  }
}

class FakeSocket {
  readonly sent: string[] = []
  readonly readyState = 1
  closed: { code?: number; reason?: string } | null = null
  private attachment: unknown

  constructor(playerId: string) {
    this.attachment = { playerId }
  }

  send(message: string): void {
    this.sent.push(message)
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
  }

  serializeAttachment(attachment: unknown): void {
    this.attachment = attachment
  }

  deserializeAttachment(): unknown {
    return this.attachment
  }
}

function createRoom(): {
  room: BattleRoom
  alpha: FakeSocket
  beta: FakeSocket
} {
  const alpha = new FakeSocket('alpha')
  const beta = new FakeSocket('beta')
  const sockets = [alpha, beta]
  const state: DurableObjectStateLike = {
    storage: new MemoryStorage(),
    acceptWebSocket: () => undefined,
    getWebSockets: () => sockets as unknown as WebSocket[],
    blockConcurrencyWhile: (callback) => callback(),
  }
  return {
    room: new BattleRoom(state, {}),
    alpha,
    beta,
  }
}

const alphaStats = { hp: 100, physical: 30, magic: 22, defense: 18 }
const betaStats = { hp: 100, physical: 24, magic: 32, defense: 20 }

async function readyBoth(
  room: BattleRoom,
  alpha: FakeSocket,
  beta: FakeSocket,
): Promise<void> {
  await room.webSocketMessage(
    alpha as unknown as WebSocket,
    JSON.stringify({ type: 'ready', stats: alphaStats }),
  )
  await room.webSocketMessage(
    beta as unknown as WebSocket,
    JSON.stringify({ type: 'ready', stats: betaStats }),
  )
}

function messages(socket: FakeSocket): RoomServerMessage[] {
  return socket.sent.map((message) => JSON.parse(message) as RoomServerMessage)
}

describe('BattleRoom', () => {
  it('2人のready後に同じ初期BattleStateを配信する', async () => {
    const { room, alpha, beta } = createRoom()
    await readyBoth(room, alpha, beta)

    const alphaStart = messages(alpha).find(
      (message) => message.type === 'battleStarted',
    )
    const betaStart = messages(beta).find(
      (message) => message.type === 'battleStarted',
    )

    expect(alphaStart).toEqual(betaStart)
    expect(alphaStart).toMatchObject({
      type: 'battleStarted',
      state: {
        turn: 1,
        status: 'active',
        combatants: [{ id: 'alpha' }, { id: 'beta' }],
      },
    })
  })

  it('片方の行動を相手へ公開せず、双方が揃った時だけ同じイベント列を配信する', async () => {
    const { room, alpha, beta } = createRoom()
    await readyBoth(room, alpha, beta)
    const betaMessageCount = beta.sent.length

    await room.webSocketMessage(
      alpha as unknown as WebSocket,
      JSON.stringify({ type: 'action', action: 'physical' }),
    )

    expect(beta.sent).toHaveLength(betaMessageCount)
    expect(messages(alpha)).toContainEqual({ type: 'actionAccepted', turn: 1 })

    await room.webSocketMessage(
      beta as unknown as WebSocket,
      JSON.stringify({ type: 'action', action: 'magic' }),
    )

    const alphaResolutionRaw = alpha.sent.findLast(
      (raw) => (JSON.parse(raw) as { type?: string }).type === 'turnResolved',
    )
    const betaResolutionRaw = beta.sent.findLast(
      (raw) => (JSON.parse(raw) as { type?: string }).type === 'turnResolved',
    )
    expect(alphaResolutionRaw).toBe(betaResolutionRaw)

    const resolution = JSON.parse(alphaResolutionRaw!) as Extract<
      RoomServerMessage,
      { type: 'turnResolved' }
    >
    expect(resolution.events[0]).toMatchObject({
      type: 'actionsRevealed',
      actions: { alpha: 'physical', beta: 'magic' },
    })
    expect(resolution.events).toContainEqual(
      expect.objectContaining({
        type: 'hit',
        sourceId: 'alpha',
        targetId: 'beta',
      }),
    )
    expect(resolution.state.turn).toBe(2)
  })

  it('防御が物理に勝ったターンでcounterイベントを配信する', async () => {
    const { room, alpha, beta } = createRoom()
    await readyBoth(room, alpha, beta)

    await room.webSocketMessage(
      alpha as unknown as WebSocket,
      JSON.stringify({ type: 'action', action: 'physical' }),
    )
    await room.webSocketMessage(
      beta as unknown as WebSocket,
      JSON.stringify({ type: 'action', action: 'defense' }),
    )

    const resolution = messages(alpha).findLast(
      (message) => message.type === 'turnResolved',
    )
    expect(resolution?.type).toBe('turnResolved')
    if (resolution?.type !== 'turnResolved') return
    expect(resolution.events).toContainEqual(
      expect.objectContaining({
        type: 'counter',
        sourceId: 'beta',
        targetId: 'alpha',
      }),
    )
  })

  it('確定済み行動の上書きを拒否する', async () => {
    const { room, alpha, beta } = createRoom()
    await readyBoth(room, alpha, beta)

    await room.webSocketMessage(
      alpha as unknown as WebSocket,
      JSON.stringify({ type: 'action', action: 'physical' }),
    )
    await room.webSocketMessage(
      alpha as unknown as WebSocket,
      JSON.stringify({ type: 'action', action: 'magic' }),
    )

    expect(messages(alpha)).toContainEqual({
      type: 'error',
      code: 'action_locked',
      message: 'このターンの行動は確定済みです',
    })
  })

  it('切断したプレイヤーを残りのプレイヤーへ通知する', async () => {
    const { room, alpha, beta } = createRoom()
    await readyBoth(room, alpha, beta)

    await room.webSocketClose(
      alpha as unknown as WebSocket,
      1000,
      'bye',
      true,
    )

    expect(messages(beta)).toContainEqual({
      type: 'opponentDisconnected',
      playerId: 'alpha',
    })
    expect(messages(beta)).toContainEqual(
      expect.objectContaining({
        type: 'presence',
        players: expect.arrayContaining([
          { id: 'alpha', ready: true, connected: false },
          { id: 'beta', ready: true, connected: true },
        ]),
      }),
    )
  })

  it('不正なstatsをreadyとして受理しない', async () => {
    const { room, alpha } = createRoom()
    await room.webSocketMessage(
      alpha as unknown as WebSocket,
      JSON.stringify({
        type: 'ready',
        stats: { ...alphaStats, hp: 0 },
      }),
    )

    expect(messages(alpha)).toContainEqual({
      type: 'error',
      code: 'invalid_message',
      message: '未対応のメッセージです',
    })
  })

  it('極端に大きなクライアント申告能力値を拒否する', async () => {
    const { room, alpha } = createRoom()
    await room.webSocketMessage(
      alpha as unknown as WebSocket,
      JSON.stringify({
        type: 'ready',
        stats: { ...alphaStats, physical: 513 },
      }),
    )

    expect(messages(alpha)).toContainEqual({
      type: 'error',
      code: 'invalid_message',
      message: '未対応のメッセージです',
    })
  })
})
