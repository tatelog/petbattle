import { describe, expect, it } from 'vitest'
import { translate, type TranslationKey } from './i18n'

describe('UI translations', () => {
  it('日本語と英語の主要UIを切り替える', () => {
    expect(translate('ja', 'summonLab')).toBe('召喚ラボ')
    expect(translate('en', 'summonLab')).toBe('Summoning Lab')
    expect(translate('en', 'xpRemaining', { xp: 120 })).toContain('120 XP')
  })

  it('相手を試合前に表示しない契約を両言語で持つ', () => {
    const key: TranslationKey = 'opponentHiddenContract'
    expect(translate('ja', key)).toMatch(/BATTLE START/)
    expect(translate('en', key)).toMatch(/hidden/)
  })
})
