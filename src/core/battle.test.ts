import { describe, expect, it } from 'vitest'
import {
  actionBeats,
  createBattleState,
  resolveTurn,
  type BattleAction,
  type CombatantInput,
} from './battle'

const alpha: CombatantInput = {
  id: 'alpha',
  hp: 100,
  physical: 30,
  magic: 28,
  defense: 20,
}

const beta: CombatantInput = {
  id: 'beta',
  hp: 100,
  physical: 26,
  magic: 32,
  defense: 24,
}

describe('actionBeats', () => {
  it.each<readonly [BattleAction, BattleAction]>([
    ['physical', 'magic'],
    ['magic', 'defense'],
    ['defense', 'physical'],
  ])('%s は %s に勝つ', (winner, loser) => {
    expect(actionBeats(winner, loser)).toBe(true)
    expect(actionBeats(loser, winner)).toBe(false)
    expect(actionBeats(winner, winner)).toBe(false)
  })
})

describe('resolveTurn', () => {
  it('物理が魔法に勝ち、物理側だけがダメージを与える', () => {
    const initial = createBattleState(alpha, beta, 42)
    const result = resolveTurn(initial, {
      alpha: 'physical',
      beta: 'magic',
    })

    expect(result.state.combatants[0].hp).toBe(alpha.hp)
    expect(result.state.combatants[1].hp).toBeLessThan(beta.hp)
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'hit',
        sourceId: 'alpha',
        targetId: 'beta',
        action: 'physical',
        simultaneous: false,
      }),
    )
  })

  it('魔法が防御を貫通する', () => {
    const result = resolveTurn(createBattleState(alpha, beta, 42), {
      alpha: 'magic',
      beta: 'defense',
    })

    expect(result.state.combatants[1].hp).toBeLessThan(beta.hp)
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'hit',
        sourceId: 'alpha',
        targetId: 'beta',
        action: 'magic',
      }),
    )
  })

  it('防御が物理を読んだときcounterイベントを発生させる', () => {
    const result = resolveTurn(createBattleState(alpha, beta, 42), {
      alpha: 'physical',
      beta: 'defense',
    })

    expect(result.state.combatants[0].hp).toBeLessThan(alpha.hp)
    expect(result.state.combatants[1].hp).toBe(beta.hp)
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'counter',
        sourceId: 'beta',
        targetId: 'alpha',
      }),
    )
  })

  it('同じ物理行動では双方が同時にダメージを受ける', () => {
    const result = resolveTurn(createBattleState(alpha, beta, 42), {
      alpha: 'physical',
      beta: 'physical',
    })
    const hits = result.events.filter((event) => event.type === 'hit')

    expect(result.state.combatants[0].hp).toBeLessThan(alpha.hp)
    expect(result.state.combatants[1].hp).toBeLessThan(beta.hp)
    expect(hits).toHaveLength(2)
    expect(hits.every((event) => event.simultaneous)).toBe(true)
  })

  it('同じ防御行動ではHPと乱数状態を変更しない', () => {
    const initial = createBattleState(alpha, beta, 42)
    const result = resolveTurn(initial, {
      alpha: 'defense',
      beta: 'defense',
    })

    expect(result.state.combatants.map(({ hp }) => hp)).toEqual([100, 100])
    expect(result.state.rngState).toBe(initial.rngState)
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'guard' }),
    )
  })

  it('同じ入力とシードから同じ状態とイベントを生成し、元状態を変更しない', () => {
    const firstInitial = createBattleState(alpha, beta, 98_765)
    const secondInitial = createBattleState(alpha, beta, 98_765)
    const initialSnapshot = structuredClone(firstInitial)
    const actions = { alpha: 'magic', beta: 'magic' } as const

    const firstResult = resolveTurn(firstInitial, actions)
    const secondResult = resolveTurn(secondInitial, actions)

    expect(firstResult).toEqual(secondResult)
    expect(firstInitial).toEqual(initialSnapshot)
  })

  it('HPが0になるとKOとbattleEndedを発生させる', () => {
    const fragileBeta = { ...beta, hp: 1 }
    const result = resolveTurn(createBattleState(alpha, fragileBeta, 7), {
      alpha: 'physical',
      beta: 'magic',
    })

    expect(result.state).toMatchObject({
      status: 'finished',
      winnerId: 'alpha',
    })
    expect(result.state.combatants[1].hp).toBe(0)
    expect(result.events).toContainEqual({
      type: 'knockout',
      turn: 1,
      combatantId: 'beta',
    })
    expect(result.events).toContainEqual({
      type: 'battleEnded',
      turn: 1,
      result: 'win',
      winnerId: 'alpha',
    })
    expect(() => resolveTurn(result.state, {
      alpha: 'physical',
      beta: 'magic',
    })).toThrow(/finished/)
  })

  it('同手の同時攻撃で双方が0になる場合は引き分けになる', () => {
    const fragileAlpha = { ...alpha, hp: 1 }
    const fragileBeta = { ...beta, hp: 1 }
    const result = resolveTurn(
      createBattleState(fragileAlpha, fragileBeta, 123),
      { alpha: 'magic', beta: 'magic' },
    )

    expect(result.state).toMatchObject({
      status: 'finished',
      winnerId: null,
    })
    expect(result.events).toContainEqual({
      type: 'battleEnded',
      turn: 1,
      result: 'draw',
      winnerId: null,
    })
  })

  it('行動不足や不正な初期値を拒否する', () => {
    const initial = createBattleState(alpha, beta)

    expect(() => resolveTurn(initial, { alpha: 'physical' })).toThrow(
      /beta/,
    )
    expect(() =>
      createBattleState(alpha, { ...beta, id: alpha.id }),
    ).toThrow(/unique/)
    expect(() => createBattleState({ ...alpha, hp: 0 }, beta)).toThrow(/hp/)
  })
})
