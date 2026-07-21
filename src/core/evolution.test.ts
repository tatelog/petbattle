import { describe, expect, it } from 'vitest'
import { adviceForTheme, buildSvgModel, validateSvgText } from './evolution'

describe('SVG Evolution Quest', () => {
  it('テーマに応じた段階的な制作助言を返す', () => {
    const advice = adviceForTheme('守護する狐', 'silhouette')
    expect(advice.observation).toMatch(/三角耳/)
    expect(advice.decomposition).toMatch(/単色/)
    expect(advice.validation).toMatch(/外部画像/)
  })

  it('元画像を参照しない自己完結SVGを構築する', () => {
    const artifact = buildSvgModel({
      theme: '星空のフクロウ',
      focus: 'layers',
      primaryColor: '#4B65D1',
      accentColor: '#69E7FF',
    })
    expect(artifact.svg).toContain('<svg')
    expect(artifact.svg).not.toMatch(/<image|href=/)
    expect(artifact.dataUrl).toMatch(/^data:image\/svg\+xml/)
    expect(artifact.traits).toContain('元画像なし')
  })

  it('危険なテーマ文字列をXMLへ直接挿入しない', () => {
    const artifact = buildSvgModel({
      theme: '<script>alert(1)</script>',
      focus: 'symbol',
      primaryColor: '#112233',
      accentColor: '#AABBCC',
    })
    expect(artifact.svg).not.toContain('<script>')
    expect(artifact.svg).toContain('&lt;script&gt;')
  })

  it('不正なテーマと色を拒否する', () => {
    expect(() => buildSvgModel({ theme: '狐', focus: 'symbol', primaryColor: 'red', accentColor: '#AABBCC' })).toThrow(/色/)
    expect(() => adviceForTheme(' ', 'layers')).toThrow(/テーマ/)
  })

  it('安全なSVGだけをアップロード入力として許可する', () => {
    expect(validateSvgText('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).toContain('<path')
    expect(() => validateSvgText('<svg><script>alert(1)</script></svg>')).toThrow(/実行可能/)
    expect(() => validateSvgText('<svg><image href="data:image/png;base64,AAAA"/></svg>')).toThrow(/埋込画像/)
    expect(() => validateSvgText('<svg><image href="https://example.com/a.png"/></svg>')).toThrow(/埋込画像/)
  })
})
