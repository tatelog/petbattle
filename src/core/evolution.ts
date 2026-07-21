export type EvolutionFocus = 'silhouette' | 'layers' | 'symbol'

export interface EvolutionAdvice {
  observation: string
  decomposition: string
  construction: string
  validation: string
}

export interface SvgModelOptions {
  theme: string
  focus: EvolutionFocus
  primaryColor: string
  accentColor: string
}

export interface SvgModelArtifact {
  questId: string
  name: string
  svg: string
  dataUrl: string
  advice: EvolutionAdvice
  traits: string[]
}

const focusLabels: Record<EvolutionFocus, string> = {
  silhouette: 'シルエット',
  layers: 'レイヤー',
  symbol: '象徴表現',
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizedTheme(value: string): string {
  const theme = value.trim().replace(/\s+/g, ' ')
  if (theme.length < 1 || theme.length > 30) {
    throw new Error('制作テーマは1〜30文字で指定してください')
  }
  return theme
}

function validColor(value: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error('色は#RRGGBB形式で指定してください')
  return value.toUpperCase()
}

function archetype(theme: string): 'fox' | 'owl' | 'turtle' | 'wolf' | 'custom' {
  const lower = theme.toLowerCase()
  if (lower.includes('狐') || lower.includes('fox')) return 'fox'
  if (lower.includes('梟') || lower.includes('フクロウ') || lower.includes('owl')) return 'owl'
  if (lower.includes('亀') || lower.includes('turtle')) return 'turtle'
  if (lower.includes('狼') || lower.includes('wolf')) return 'wolf'
  return 'custom'
}

export function adviceForTheme(themeInput: string, focus: EvolutionFocus): EvolutionAdvice {
  const theme = normalizedTheme(themeInput)
  const kind = archetype(theme)
  const feature = kind === 'fox'
    ? '大きな三角耳・細い鼻先・長い尾'
    : kind === 'owl'
      ? '円形の目・左右へ広がる翼・短い胴'
      : kind === 'turtle'
        ? '楕円の甲羅・四肢・頭部の突出'
        : kind === 'wolf'
          ? '立った耳・長い口吻・力強い胸部'
          : '外形・中心となる部位・識別しやすい特徴'
  const focusGuide = focus === 'silhouette'
    ? '細部を足す前に、単色でもテーマが読める外形を作ります。'
    : focus === 'layers'
      ? '背景・身体・特徴・発光の4レイヤーへ分け、重なり順を管理します。'
      : 'テーマを一つの紋章へ言い換え、反復できる記号として配置します。'
  return {
    observation: `${theme}を観察し、${feature}のうち判別に必要な3要素を選びます。`,
    decomposition: `円・楕円・三角形・曲線へ分解します。${focusGuide}`,
    construction: 'viewBox 720×720上で中心線を決め、左右の座標とパスの役割を確認しながら組み立てます。',
    validation: '縮小表示と単色表示を確認し、テーマが読めるか、不要な外部画像を参照していないかを検証します。',
  }
}

function questIdFor(theme: string, focus: EvolutionFocus): string {
  const slug = [...theme].map((character) => character.codePointAt(0)!.toString(16)).join('-')
  return `svg-${focus}-${slug}`
}

export function buildSvgModel(options: SvgModelOptions): SvgModelArtifact {
  const theme = normalizedTheme(options.theme)
  const primary = validColor(options.primaryColor)
  const accent = validColor(options.accentColor)
  const kind = archetype(theme)
  const safeTheme = escapeXml(theme)
  const ears = kind === 'turtle'
    ? ''
    : kind === 'owl'
      ? '<path d="M252 255 292 170l48 92M380 262l48-92 40 85" fill="url(#body)" stroke="#F7F3E8" stroke-width="12" stroke-linejoin="round"/>'
      : '<path d="M258 255 278 148l78 92M364 240l78-92 20 107" fill="url(#body)" stroke="#F7F3E8" stroke-width="12" stroke-linejoin="round"/>'
  const body = kind === 'turtle'
    ? '<ellipse cx="360" cy="430" rx="196" ry="132" fill="url(#body)" stroke="#F7F3E8" stroke-width="14"/><path d="M228 430h264M360 304v252M268 342l184 176M452 342 268 518" opacity=".34" stroke="#F7F3E8" stroke-width="10"/><circle cx="548" cy="430" r="58" fill="url(#body)" stroke="#F7F3E8" stroke-width="12"/>'
    : kind === 'owl'
      ? '<ellipse cx="360" cy="440" rx="154" ry="184" fill="url(#body)" stroke="#F7F3E8" stroke-width="14"/><path d="M248 358Q150 430 238 548M472 358q98 72 10 190" fill="none" stroke="#F7F3E8" stroke-width="34" stroke-linecap="round"/>'
      : '<ellipse cx="360" cy="455" rx="146" ry="170" fill="url(#body)" stroke="#F7F3E8" stroke-width="14"/><path d="M234 460q-150 18-116 144 72-86 190-72" fill="url(#body)" stroke="#F7F3E8" stroke-width="14" stroke-linejoin="round"/>'
  const face = kind === 'turtle'
    ? '<circle cx="565" cy="416" r="8" fill="#10141D"/>'
    : kind === 'owl'
      ? '<circle cx="310" cy="320" r="54" fill="#F7F3E8"/><circle cx="410" cy="320" r="54" fill="#F7F3E8"/><circle cx="310" cy="320" r="19" fill="#10141D"/><circle cx="410" cy="320" r="19" fill="#10141D"/><path d="m360 344-22 34h44Z" fill="' + accent + '"/>'
      : '<circle cx="360" cy="310" r="112" fill="url(#body)" stroke="#F7F3E8" stroke-width="14"/><circle cx="323" cy="300" r="13" fill="#10141D"/><circle cx="397" cy="300" r="13" fill="#10141D"/><path d="m360 326-18 18 18 14 18-14Z" fill="#10141D"/><path d="M324 374q36 30 72 0" fill="none" stroke="#F7F3E8" stroke-width="10" stroke-linecap="round"/>'
  const focusMotif = options.focus === 'silhouette'
    ? '<path d="M150 596q210 86 420 0" fill="none" stroke="' + accent + '" stroke-width="18" stroke-linecap="round" opacity=".75"/>'
    : options.focus === 'layers'
      ? '<g fill="none" stroke="' + accent + '" stroke-width="8" opacity=".72"><circle cx="360" cy="360" r="252"/><circle cx="360" cy="360" r="284" stroke-dasharray="18 22"/></g>'
      : '<path d="m360 90 32 66 72 10-52 50 12 72-64-34-64 34 12-72-52-50 72-10Z" fill="' + accent + '" opacity=".38"/>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720" role="img" aria-labelledby="title desc"><title id="title">${safeTheme}のSVGベクターモデル</title><desc id="desc">元画像を使わず基本図形とパスから構築した${focusLabels[options.focus]}課題</desc><defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient><radialGradient id="core"><stop stop-color="${accent}" stop-opacity=".42"/><stop offset="1" stop-color="#050711" stop-opacity="0"/></radialGradient></defs><circle cx="360" cy="360" r="330" fill="url(#core)"/>${focusMotif}<g>${ears}${body}${face}</g><circle cx="360" cy="360" r="318" fill="none" stroke="${accent}" stroke-width="5" stroke-dasharray="8 18" opacity=".5"/></svg>`
  return {
    questId: questIdFor(theme, options.focus),
    name: `${theme} Vector Core`,
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    advice: adviceForTheme(theme, options.focus),
    traits: [theme, focusLabels[options.focus], 'ベクター', '元画像なし'],
  }
}

export function evolutionFocusLabel(focus: EvolutionFocus): string {
  return focusLabels[focus]
}

export function validateSvgText(input: string): string {
  const svg = input.trim()
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>$/i.test(svg)) {
    throw new Error('SVGルート要素を確認できません')
  }
  if (/<(?:script|foreignObject|iframe|object|embed|image)\b/i.test(svg)) {
    throw new Error('実行可能要素や埋込画像を含むSVGは読み込めません')
  }
  if (/\son[a-z]+\s*=/i.test(svg) || /(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|data:text\/html)/i.test(svg)) {
    throw new Error('イベント属性や外部参照を含むSVGは読み込めません')
  }
  return svg
}
