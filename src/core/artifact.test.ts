import { describe, expect, it } from 'vitest'
import {
  LV1_IMAGE_POLICY,
  createFallbackLunaAnalysis,
  createPetManifest,
  extractCanvasFeatures,
  normalizeEssence,
  statsFromEssence,
  validateLevel1Image,
  type CanvasFeatures,
} from './artifact'

const grayFeatures: CanvasFeatures = {
  width: 64,
  height: 64,
  luminance: 500,
  saturation: 0,
  contrast: 0,
  edgeDensity: 0,
  symmetry: 1000,
  warmth: 500,
  entropy: 0,
  alphaCoverage: 1000,
}

describe('Lv1画像ポリシー', () => {
  it('JPEG・PNG・WebPだけを2MiBまで許可する', () => {
    expect(validateLevel1Image({ type: 'image/jpeg', size: LV1_IMAGE_POLICY.maxBytes })).toBe(
      'image/jpeg',
    )
    expect(validateLevel1Image({ type: 'IMAGE/PNG', size: 1 })).toBe('image/png')
    expect(() => validateLevel1Image({ type: 'image/gif', size: 1 })).toThrow(/JPEG/)
    expect(() =>
      validateLevel1Image({ type: 'image/webp', size: LV1_IMAGE_POLICY.maxBytes + 1 }),
    ).toThrow(/2MiB/)
  })
})

describe('Canvas特徴', () => {
  it('単色の不透明グレーを決定論的な整数特徴へ変換する', () => {
    const features = extractCanvasFeatures({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([128, 128, 128, 255]),
    })

    expect(features).toEqual({
      width: 1,
      height: 1,
      luminance: 502,
      saturation: 0,
      contrast: 0,
      edgeDensity: 0,
      symmetry: 1000,
      warmth: 500,
      entropy: 0,
      alphaCoverage: 1000,
    })
    expect(extractCanvasFeatures({ width: 1, height: 1, data: [128, 128, 128, 255] })).toEqual(
      features,
    )
  })

  it('RGBAデータ不足を拒否する', () => {
    expect(() => extractCanvasFeatures({ width: 2, height: 2, data: [0, 0, 0, 255] })).toThrow(
      /不足/,
    )
  })
})

describe('semantic essenceと能力値', () => {
  it('任意の重みを最大剰余法で合計16に正規化する', () => {
    expect(normalizeEssence({ physical: 1, magic: 1, defense: 1 })).toEqual({
      physical: 6,
      magic: 5,
      defense: 5,
    })
    expect(normalizeEssence({ physical: 999_999, magic: 0, defense: 0 })).toEqual({
      physical: 16,
      magic: 0,
      defense: 0,
    })
  })

  it('生トークン数を参照せず固定式だけで能力値を計算する', () => {
    expect(statsFromEssence({ physical: 6, magic: 5, defense: 5 })).toEqual({
      physical: 60,
      magic: 54,
      defense: 55,
      hp: 138,
    })
  })

  it('fallback解析は同じ特徴とseedから常に同じ結果を返す', () => {
    const first = createFallbackLunaAnalysis(grayFeatures, 'abc')
    const second = createFallbackLunaAnalysis(grayFeatures, 'abc')
    expect(first).toEqual(second)
    expect(first.essence.physical + first.essence.magic + first.essence.defense).toBe(16)
  })
})

describe('PET manifest', () => {
  it('API解析なしでもローカル特徴だけで有効なPETを生成する', () => {
    const manifest = createPetManifest({
      sha256: '0'.repeat(64),
      mime: 'image/png',
      size: 512,
      features: grayFeatures,
    })

    expect(manifest.analysisSource).toBe('fallback')
    expect(manifest.analysis.essence.physical + manifest.analysis.essence.magic + manifest.analysis.essence.defense).toBe(16)
    expect(manifest.stats).toEqual(statsFromEssence(manifest.analysis.essence))
  })

  it('有効なLuna解析を採用し、AIに能力値を決めさせない', () => {
    const manifest = createPetManifest({
      sha256: 'a'.repeat(64),
      mime: 'image/webp',
      size: 1024,
      features: grayFeatures,
      source: 'generated',
      luna: {
        name: 'ルナ',
        species: '月光獣',
        element: 'light',
        temperament: 'clever',
        traits: ['radiant', 'arcane'],
        essence: { physical: 3, magic: 9, defense: 4 },
        physical: 9999,
      },
    })

    // strict schema rejects the injected stat, so the deterministic fallback wins.
    expect(manifest.analysisSource).toBe('fallback')
    expect(manifest.source.origin).toBe('generated')
    expect(manifest.stats).toEqual(statsFromEssence(manifest.analysis.essence))
  })

  it('strictなLuna解析だけを採用する', () => {
    const manifest = createPetManifest({
      sha256: 'b'.repeat(64),
      mime: 'image/png',
      size: 2048,
      features: grayFeatures,
      luna: {
        name: 'ルナ',
        species: '月光獣',
        element: 'light',
        temperament: 'clever',
        traits: ['radiant', 'arcane'],
        essence: { physical: 3, magic: 9, defense: 4 },
      },
    })

    expect(manifest.analysisSource).toBe('luna')
    expect(manifest.stats).toEqual({ physical: 42, magic: 78, defense: 48, hp: 131 })
  })
})
