import { describe, expect, it } from 'vitest'
import {
  awardBattleResult,
  completeEvolutionQuest,
  createInitialProgress,
  levelForXp,
  parseStoredProgress,
  xpProgress,
} from './progression'

describe('Core progression', () => {
  it('1試合だけではLv.2にならない', () => {
    const reward = awardBattleResult(createInitialProgress(), 'win', ['physical', 'magic', 'defense'])
    expect(reward.xpGained).toBe(40)
    expect(reward.currentLevel).toBe(1)
    expect(reward.leveledUp).toBe(false)
    expect(xpProgress(reward.progress)).toEqual({ current: 40, required: 160, ratio: 0.25 })
  })

  it('複数試合の結果と行動習熟を蓄積する', () => {
    let progress = createInitialProgress()
    for (let index = 0; index < 4; index += 1) {
      progress = awardBattleResult(progress, 'win', ['physical', 'magic', 'defense']).progress
    }
    expect(levelForXp(progress.xp)).toBe(2)
    expect(progress).toMatchObject({ battles: 4, wins: 4, streak: 4, bestStreak: 4 })
    expect(progress.mastery).toEqual({ physical: 4, magic: 4, defense: 4 })
  })

  it('進化クエストは一度だけXPとポートフォリオを追加する', () => {
    const base = { ...createInitialProgress(), xp: 160 }
    const entry = {
      id: 'artifact-1',
      questId: 'svg-guardian-fox',
      theme: '狐',
      format: 'SVG',
      focus: 'シルエット',
      reflection: '耳と尾を三角形と曲線へ分解した',
      createdAt: '2026-07-22T00:00:00.000Z',
    }
    const first = completeEvolutionQuest(base, entry)
    const second = completeEvolutionQuest(first.progress, { ...entry, id: 'artifact-2', reflection: 'モデルの配色を更新した' })
    expect(first.xpGained).toBe(60)
    expect(first.progress.portfolio).toHaveLength(1)
    expect(second.xpGained).toBe(0)
    expect(second.progress.xp).toBe(first.progress.xp)
    expect(second.progress.portfolio).toHaveLength(1)
    expect(second.progress.portfolio[0]?.reflection).toBe('モデルの配色を更新した')
  })

  it('壊れた保存データを安全な初期値へ正規化する', () => {
    expect(parseStoredProgress({ xp: -10, battles: 'bad', mastery: { physical: 4 } })).toMatchObject({
      xp: 0,
      battles: 0,
      mastery: { physical: 4, magic: 0, defense: 0 },
    })
  })

  it('生成Artifactを保存データから復元できる', () => {
    const stored = {
      ...createInitialProgress(),
      xp: 220,
      portfolio: [{
        id: 'saved-artifact',
        questId: 'svg-layers-owl',
        theme: 'フクロウ',
        format: 'SVG',
        focus: 'レイヤー',
        reflection: '翼を別レイヤーにした',
        createdAt: '2026-07-22T00:00:00.000Z',
        artifact: {
          name: 'Owl Vector Core',
          dataUrl: 'data:image/svg+xml,test',
          accentColor: '#69E7FF',
          traits: ['フクロウ', 'ベクター'],
          stats: { hp: 150, physical: 60, magic: 70, defense: 80, essence: 32 },
        },
      }],
    }
    expect(parseStoredProgress(JSON.parse(JSON.stringify(stored))).portfolio[0]?.artifact?.name).toBe('Owl Vector Core')
  })
})
