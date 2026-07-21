import type { BattleAction } from './battle'

export type CoreLevel = 1 | 2 | 3 | 4 | 5
export type BattleOutcome = 'win' | 'draw' | 'loss'

export interface LevelProfile {
  level: CoreLevel
  minXp: number
  formats: readonly string[]
  maxBytes: number
  essenceCapacity: number
  learningTheme: string
  unlockLabel: string
}

export const LEVEL_PROFILES: readonly LevelProfile[] = [
  { level: 1, minXp: 0, formats: ['JPEG', 'PNG', 'WebP'], maxBytes: 2 * 1024 * 1024, essenceCapacity: 16, learningTheme: '色・構図・意味認識', unlockLabel: 'ラスター画像' },
  { level: 2, minXp: 160, formats: ['SVG'], maxBytes: 5 * 1024 * 1024, essenceCapacity: 32, learningTheme: '座標・パス・レイヤー', unlockLabel: 'SVGベクターモデル' },
  { level: 3, minXp: 420, formats: ['JSON Effect Recipe'], maxBytes: 10 * 1024 * 1024, essenceCapacity: 64, learningTheme: '関数・反復・デバッグ', unlockLabel: 'コードエフェクト' },
  { level: 4, minXp: 800, formats: ['GLB', 'OBJ', 'STL'], maxBytes: 25 * 1024 * 1024, essenceCapacity: 128, learningTheme: '頂点・面・法線・素材', unlockLabel: '3Dモデル' },
  { level: 5, minXp: 1300, formats: ['PDF', 'IFC'], maxBytes: 50 * 1024 * 1024, essenceCapacity: 256, learningTheme: '階層・属性・関係', unlockLabel: '構造化Artifact' },
] as const

export interface LearningPortfolioEntry {
  id: string
  questId: string
  theme: string
  format: string
  focus: string
  reflection: string
  createdAt: string
  artifact?: {
    name: string
    dataUrl: string
    accentColor: string
    traits: string[]
    stats: { hp: number; physical: number; magic: number; defense: number; essence: number }
  }
}

export interface PlayerProgress {
  version: 1
  xp: number
  battles: number
  wins: number
  draws: number
  losses: number
  streak: number
  bestStreak: number
  mastery: Record<BattleAction, number>
  completedQuestIds: string[]
  portfolio: LearningPortfolioEntry[]
}

export interface BattleReward {
  progress: PlayerProgress
  xpGained: number
  outcome: BattleOutcome
  varietyBonus: number
  previousLevel: CoreLevel
  currentLevel: CoreLevel
  leveledUp: boolean
}

export function createInitialProgress(): PlayerProgress {
  return {
    version: 1,
    xp: 0,
    battles: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    mastery: { physical: 0, magic: 0, defense: 0 },
    completedQuestIds: [],
    portfolio: [],
  }
}

export function levelForXp(xp: number): CoreLevel {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0))
  return LEVEL_PROFILES.reduce<CoreLevel>(
    (level, profile) => safeXp >= profile.minXp ? profile.level : level,
    1,
  )
}

export function profileForLevel(level: CoreLevel): LevelProfile {
  return LEVEL_PROFILES[level - 1]!
}

export function nextLevelProfile(level: CoreLevel): LevelProfile | null {
  return level >= 5 ? null : profileForLevel((level + 1) as CoreLevel)
}

export function xpProgress(progress: PlayerProgress): { current: number; required: number; ratio: number } {
  const level = levelForXp(progress.xp)
  const currentProfile = profileForLevel(level)
  const next = nextLevelProfile(level)
  if (!next) return { current: progress.xp - currentProfile.minXp, required: 0, ratio: 1 }
  const current = Math.max(0, progress.xp - currentProfile.minXp)
  const required = next.minXp - currentProfile.minXp
  return { current, required, ratio: Math.min(1, current / required) }
}

export function awardBattleResult(
  progress: PlayerProgress,
  outcome: BattleOutcome,
  actions: readonly BattleAction[],
): BattleReward {
  const previousLevel = levelForXp(progress.xp)
  const uniqueActions = new Set(actions)
  const varietyBonus = uniqueActions.size * 2
  const baseXp = outcome === 'win' ? 34 : outcome === 'draw' ? 22 : 16
  const xpGained = baseXp + varietyBonus
  const streak = outcome === 'win' ? progress.streak + 1 : 0
  const mastery = { ...progress.mastery }
  for (const action of actions) mastery[action] += 1
  const nextProgress: PlayerProgress = {
    ...progress,
    xp: progress.xp + xpGained,
    battles: progress.battles + 1,
    wins: progress.wins + (outcome === 'win' ? 1 : 0),
    draws: progress.draws + (outcome === 'draw' ? 1 : 0),
    losses: progress.losses + (outcome === 'loss' ? 1 : 0),
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    mastery,
  }
  const currentLevel = levelForXp(nextProgress.xp)
  return {
    progress: nextProgress,
    xpGained,
    outcome,
    varietyBonus,
    previousLevel,
    currentLevel,
    leveledUp: currentLevel > previousLevel,
  }
}

export function completeEvolutionQuest(
  progress: PlayerProgress,
  entry: LearningPortfolioEntry,
  xpReward = 60,
): { progress: PlayerProgress; xpGained: number; leveledUp: boolean } {
  if (progress.completedQuestIds.includes(entry.questId)) {
    return {
      progress: {
        ...progress,
        portfolio: [entry, ...progress.portfolio.filter((item) => item.questId !== entry.questId)].slice(0, 20),
      },
      xpGained: 0,
      leveledUp: false,
    }
  }
  const previousLevel = levelForXp(progress.xp)
  const nextProgress: PlayerProgress = {
    ...progress,
    xp: progress.xp + xpReward,
    completedQuestIds: [...progress.completedQuestIds, entry.questId],
    portfolio: [entry, ...progress.portfolio].slice(0, 20),
  }
  return {
    progress: nextProgress,
    xpGained: xpReward,
    leveledUp: levelForXp(nextProgress.xp) > previousLevel,
  }
}

export function parseStoredProgress(value: unknown): PlayerProgress {
  if (!value || typeof value !== 'object') return createInitialProgress()
  const candidate = value as Partial<PlayerProgress>
  const safeNumber = (input: unknown) => typeof input === 'number' && Number.isFinite(input) && input >= 0 ? Math.floor(input) : 0
  const initial = createInitialProgress()
  return {
    ...initial,
    xp: safeNumber(candidate.xp),
    battles: safeNumber(candidate.battles),
    wins: safeNumber(candidate.wins),
    draws: safeNumber(candidate.draws),
    losses: safeNumber(candidate.losses),
    streak: safeNumber(candidate.streak),
    bestStreak: safeNumber(candidate.bestStreak),
    mastery: {
      physical: safeNumber(candidate.mastery?.physical),
      magic: safeNumber(candidate.mastery?.magic),
      defense: safeNumber(candidate.mastery?.defense),
    },
    completedQuestIds: Array.isArray(candidate.completedQuestIds)
      ? candidate.completedQuestIds.filter((item): item is string => typeof item === 'string').slice(0, 50)
      : [],
    portfolio: Array.isArray(candidate.portfolio)
      ? candidate.portfolio.filter((item): item is LearningPortfolioEntry => Boolean(item && typeof item === 'object' && typeof item.questId === 'string')).slice(0, 20)
      : [],
  }
}
