/** PETBATTLE のサーバー権威型バトルで共有する、決定論的なルールエンジン。 */

export type BattleAction = 'physical' | 'magic' | 'defense'

export type BattleStatus = 'active' | 'finished'

export interface CombatantInput {
  readonly id: string
  readonly hp: number
  readonly physical: number
  readonly magic: number
  readonly defense: number
}

export interface CombatantState extends CombatantInput {
  readonly maxHp: number
}

/** `turn` は次に解決するターン番号（1始まり）。 */
export interface BattleState {
  readonly turn: number
  readonly seed: number
  readonly rngState: number
  readonly combatants: readonly [CombatantState, CombatantState]
  readonly status: BattleStatus
  readonly winnerId: string | null
}

export type BattleEvent =
  | {
      readonly type: 'actionsRevealed'
      readonly turn: number
      readonly actions: Readonly<Record<string, BattleAction>>
    }
  | {
      readonly type: 'hit'
      readonly turn: number
      readonly sourceId: string
      readonly targetId: string
      readonly action: 'physical' | 'magic'
      readonly damage: number
      readonly targetHp: number
      readonly variance: number
      readonly simultaneous: boolean
    }
  | {
      readonly type: 'counter'
      readonly turn: number
      readonly sourceId: string
      readonly targetId: string
      readonly damage: number
      readonly targetHp: number
      readonly variance: number
    }
  | {
      readonly type: 'guard'
      readonly turn: number
      readonly combatantIds: readonly [string, string]
    }
  | {
      readonly type: 'knockout'
      readonly turn: number
      readonly combatantId: string
    }
  | {
      readonly type: 'battleEnded'
      readonly turn: number
      readonly result: 'win' | 'draw'
      readonly winnerId: string | null
    }

export type TurnActions = Readonly<Record<string, BattleAction>>

export interface TurnResolution {
  readonly state: BattleState
  readonly events: readonly BattleEvent[]
}

const BEATS: Readonly<Record<BattleAction, BattleAction>> = {
  physical: 'magic',
  magic: 'defense',
  defense: 'physical',
}

const UINT32_RANGE = 4_294_967_296
const RNG_INCREMENT = 0x6d2b79f5

interface RandomResult {
  readonly value: number
  readonly state: number
}

interface DamageResult extends RandomResult {
  readonly damage: number
  readonly variance: number
}

type DamageContext = 'advantage' | 'clash' | 'counter'

export function actionBeats(
  action: BattleAction,
  opponentAction: BattleAction,
): boolean {
  return BEATS[action] === opponentAction
}

export function createBattleState(
  first: CombatantInput,
  second: CombatantInput,
  seed = 1,
): BattleState {
  validateCombatant(first)
  validateCombatant(second)

  if (first.id === second.id) {
    throw new Error('Combatant IDs must be unique.')
  }
  if (!Number.isSafeInteger(seed)) {
    throw new Error('Seed must be a safe integer.')
  }

  const normalizedSeed = seed >>> 0

  return {
    turn: 1,
    seed: normalizedSeed,
    rngState: normalizedSeed,
    combatants: [toCombatantState(first), toCombatantState(second)],
    status: 'active',
    winnerId: null,
  }
}

export function resolveTurn(
  state: BattleState,
  actions: TurnActions,
): TurnResolution {
  if (state.status !== 'active') {
    throw new Error('Cannot resolve a turn after the battle has finished.')
  }

  const [first, second] = state.combatants
  const firstAction = readAction(actions, first.id)
  const secondAction = readAction(actions, second.id)
  const revealedActions = Object.freeze({
    [first.id]: firstAction,
    [second.id]: secondAction,
  })
  const events: BattleEvent[] = [
    {
      type: 'actionsRevealed',
      turn: state.turn,
      actions: revealedActions,
    },
  ]

  let rngState = state.rngState >>> 0
  let firstHp = first.hp
  let secondHp = second.hp

  if (firstAction === secondAction) {
    if (firstAction === 'defense') {
      events.push({
        type: 'guard',
        turn: state.turn,
        combatantIds: [first.id, second.id],
      })
    } else {
      const firstDamage = calculateDamage(
        first,
        second,
        firstAction,
        'clash',
        rngState,
      )
      rngState = firstDamage.state
      const secondDamage = calculateDamage(
        second,
        first,
        secondAction,
        'clash',
        rngState,
      )
      rngState = secondDamage.state

      secondHp = applyDamage(secondHp, firstDamage.damage)
      firstHp = applyDamage(firstHp, secondDamage.damage)
      events.push(
        {
          type: 'hit',
          turn: state.turn,
          sourceId: first.id,
          targetId: second.id,
          action: firstAction,
          damage: firstDamage.damage,
          targetHp: secondHp,
          variance: firstDamage.variance,
          simultaneous: true,
        },
        {
          type: 'hit',
          turn: state.turn,
          sourceId: second.id,
          targetId: first.id,
          action: firstAction,
          damage: secondDamage.damage,
          targetHp: firstHp,
          variance: secondDamage.variance,
          simultaneous: true,
        },
      )
    }
  } else {
    const firstWon = actionBeats(firstAction, secondAction)
    const winner = firstWon ? first : second
    const loser = firstWon ? second : first
    const winningAction = firstWon ? firstAction : secondAction

    if (winningAction === 'defense') {
      const result = calculateDamage(
        winner,
        loser,
        winningAction,
        'counter',
        rngState,
      )
      rngState = result.state
      if (firstWon) {
        secondHp = applyDamage(secondHp, result.damage)
      } else {
        firstHp = applyDamage(firstHp, result.damage)
      }
      events.push({
        type: 'counter',
        turn: state.turn,
        sourceId: winner.id,
        targetId: loser.id,
        damage: result.damage,
        targetHp: firstWon ? secondHp : firstHp,
        variance: result.variance,
      })
    } else {
      const result = calculateDamage(
        winner,
        loser,
        winningAction,
        'advantage',
        rngState,
      )
      rngState = result.state
      if (firstWon) {
        secondHp = applyDamage(secondHp, result.damage)
      } else {
        firstHp = applyDamage(firstHp, result.damage)
      }
      events.push({
        type: 'hit',
        turn: state.turn,
        sourceId: winner.id,
        targetId: loser.id,
        action: winningAction,
        damage: result.damage,
        targetHp: firstWon ? secondHp : firstHp,
        variance: result.variance,
        simultaneous: false,
      })
    }
  }

  const nextCombatants: readonly [CombatantState, CombatantState] = [
    { ...first, hp: firstHp },
    { ...second, hp: secondHp },
  ]
  const firstKnockedOut = firstHp === 0
  const secondKnockedOut = secondHp === 0

  if (firstKnockedOut) {
    events.push({
      type: 'knockout',
      turn: state.turn,
      combatantId: first.id,
    })
  }
  if (secondKnockedOut) {
    events.push({
      type: 'knockout',
      turn: state.turn,
      combatantId: second.id,
    })
  }

  const finished = firstKnockedOut || secondKnockedOut
  const winnerId = getWinnerId(
    first,
    second,
    firstKnockedOut,
    secondKnockedOut,
  )

  if (finished) {
    events.push({
      type: 'battleEnded',
      turn: state.turn,
      result: winnerId === null ? 'draw' : 'win',
      winnerId,
    })
  }

  return {
    state: {
      turn: state.turn + 1,
      seed: state.seed,
      rngState,
      combatants: nextCombatants,
      status: finished ? 'finished' : 'active',
      winnerId,
    },
    events,
  }
}

function calculateDamage(
  source: CombatantState,
  target: CombatantState,
  action: BattleAction,
  context: DamageContext,
  rngState: number,
): DamageResult {
  const random = nextRandom(rngState)
  const variance = 0.9 + random.value * 0.2

  let power: number
  let powerMultiplier: number
  let defenseMultiplier: number

  if (context === 'counter') {
    power = source.defense
    powerMultiplier = 0.9
    defenseMultiplier = 0.2
  } else {
    power = action === 'physical' ? source.physical : source.magic
    powerMultiplier = context === 'advantage' ? 1.2 : 0.75
    defenseMultiplier = action === 'magic' ? 0.2 : 0.35
  }

  const baseDamage = Math.max(
    1,
    power * powerMultiplier - target.defense * defenseMultiplier,
  )

  return {
    damage: Math.max(1, Math.round(baseDamage * variance)),
    variance,
    value: random.value,
    state: random.state,
  }
}

/** Mulberry32。外部状態を持たず、次状態も明示的に返す。 */
function nextRandom(state: number): RandomResult {
  const nextState = (state + RNG_INCREMENT) >>> 0
  let value = nextState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  value = (value ^ (value >>> 14)) >>> 0

  return {
    value: value / UINT32_RANGE,
    state: nextState,
  }
}

function getWinnerId(
  first: CombatantState,
  second: CombatantState,
  firstKnockedOut: boolean,
  secondKnockedOut: boolean,
): string | null {
  if (firstKnockedOut === secondKnockedOut) {
    return null
  }
  return firstKnockedOut ? second.id : first.id
}

function applyDamage(hp: number, damage: number): number {
  return Math.max(0, hp - damage)
}

function readAction(actions: TurnActions, combatantId: string): BattleAction {
  const action = actions[combatantId]
  if (
    action !== 'physical' &&
    action !== 'magic' &&
    action !== 'defense'
  ) {
    throw new Error(`Missing or invalid action for combatant "${combatantId}".`)
  }
  return action
}

function toCombatantState(input: CombatantInput): CombatantState {
  return {
    ...input,
    maxHp: input.hp,
  }
}

function validateCombatant(combatant: CombatantInput): void {
  if (combatant.id.trim().length === 0) {
    throw new Error('Combatant ID must not be empty.')
  }
  validateStat('hp', combatant.hp, false)
  validateStat('physical', combatant.physical, true)
  validateStat('magic', combatant.magic, true)
  validateStat('defense', combatant.defense, true)
}

function validateStat(name: string, value: number, allowZero: boolean): void {
  const minimum = allowZero ? 0 : 1
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer of at least ${minimum}.`)
  }
}
