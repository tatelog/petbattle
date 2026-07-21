export type Locale = 'ja' | 'en'

const ja = {
  languageJapanese: '日本語', languageEnglish: 'English', switchToLight: 'ライトモードへ切替', switchToDark: 'ダークモードへ切替',
  heroEyebrow: 'ANYTHING CAN ENTER THE ARENA', heroTitle1: 'あらゆる表現を、', heroTitle2: '戦える存在へ。', heroDescription: '画像を意味エッセンスへ変換し、3Dコロシアムへ召喚。大量に生成した人ではなく、意味のある表現を作れる人が強くなる。',
  progressLabel: '進行状況', stepSummon: '召喚', stepAnalyze: '意味解析', stepBattle: '3Dバトル', stepEvolution: '進化',
  summonLab: '召喚ラボ', coreCapacity: 'Core容量', apiFree: 'API不要 · LOCAL MODE', localLuna: 'LOCAL + LUNA',
  artifactChoose: 'Artifactを選ぶ', yourArtifact: 'YOUR ARTIFACT', analyze: '意味を解析', analyzeLocal: 'ローカルで意味を解析', analyzing: '意味を解析中…',
  battleMode: '対戦モード', battleModeDescription: 'LOCAL CPUはAPI不要。通信対戦だけWorker接続を使用します。', workerMissing: '通信Workerが未設定です', workerMissingDescription: 'VITE_BATTLE_WORKER_URLへCloudflare WorkerのURLを設定すると利用できます。ローカルCPU戦はそのまま遊べます。',
  newRoomId: '新しいルームIDを作成', startCpu: 'CPU戦を3Dコロシアムで開始', readyPet: 'このPETをREADY', waitOpponent: '対戦相手のREADYを待機中…', connectingArena: '通信コロシアムへ接続中…', reconnectRoom: 'ルームへ再接続', connectRoom: 'ルームへ接続',
  coreJourney: 'CORE JOURNEY', growthLab: '育成・進化ラボ', growthDescription: '勝敗だけでなく、行動の使い分けと制作課題を学習履歴として蓄積します。', nextUnlock: '次の「{name}」まであと{xp} XP', allUnlocked: '全Core Level解放済み',
  battles: 'BATTLES', wins: 'WINS', streak: 'STREAK', quests: 'QUESTS', masteryLabel: '行動習熟度', physicalMastery: '物理習熟 {value}', magicMastery: '魔法習熟 {value}', defenseMastery: '防御習熟 {value}', roadmap: 'Core Levelロードマップ',
  questTitle: '元画像なしベクターモデル', unlockInWins: '4勝前後でCore Level 2へ', questLockedDescription: '解放後は「狐」「フクロウ」「海亀」などのテーマを自分で指定し、観察→分解→構築→検証の助言に沿ってSVGモデルを作れます。',
  themeLabel: '1. 制作テーマ（動物など）', focusLabel: '2. 学ぶ焦点', focusSilhouette: 'シルエット', focusLayers: 'レイヤー', focusSymbol: '象徴表現', primaryColor: '主色', glowColor: '発光色', buildSvg: '助言を生成してSVGモデルを構築',
  noSourceImage: 'NO SOURCE IMAGE', thinkStructure: 'テーマから構造を考える', thinkStructureDescription: '左の条件を決めると、外部画像を参照しないSVGを構築します。', reflectionLabel: '3. 何をどう作ったか', reflectionPlaceholder: '例：耳と尾を三角形と曲線へ分け、縮小しても狐に見えるよう調整した', saveEvidence: '学習Evidenceとして保存しPETを進化', portfolio: '学習ポートフォリオ',
  petParameters: '自分のPET Core能力値', parameterAnalysis: 'パラメータ解析', physical: '物理', magic: '魔法', defense: '防御', physicalCommandNote: '魔法を中断', magicCommandNote: '防御を貫通', defenseCommandNote: '物理をカウンター', battleActions: 'バトル行動',
  fullscreenOpen: 'バトル画面を全画面表示', fullscreenClose: 'バトル画面の全画面表示を終了', backSummon: '召喚ラボへ', backSummonLong: '召喚ラボへ戻る', evolutionLab: '進化ラボへ', rematch: '再戦', actionVariety: '行動バリエーション +{value}', calculatingResult: 'バトル結果と習熟度を集計しています…',
  levelUp: 'CORE LEVEL {level}へ進化。{unlock}が解放されました。', xpRemaining: '次の解放まであと{xp} XP。複数試合の経験と制作課題で成長します。', maxLevel: 'すべてのCore Levelを解放しています。',
  footer: 'PETBATTLE · 意味を理解し、表現を育てるバトルプロトタイプ',
  messageSample: 'サンプルPETです。好きな画像へ差し替えられます。', messageApiFree: 'APIなしのローカルモードです。画像解析からCPUバトルまでそのまま遊べます。', messageDescend: '鳥瞰カメラからコロシアムへ降下します。', messageOnlinePrompt: 'ルームへ接続すると、PET能力値をREADYできます。', messageEvolutionPrompt: 'テーマを決めると、制作を4段階へ分解します。',
  battleStart: 'BATTLE START — 行動を選択してください。', battleSkip: 'BATTLE START — 導入演出をスキップしました。', summonSequence: '召喚シーケンス開始。コロシアムへ降下中…', fullscreenError: '全画面表示を開始できませんでした。ブラウザの全画面設定を確認してください。',
  opponentHiddenContract: '対戦相手はBATTLE STARTまで非公開',
  unlockRaster: 'ラスター画像', unlockSvg: 'SVGベクターモデル', unlockCode: 'コードエフェクト', unlock3d: '3Dモデル', unlockStructure: '構造化Artifact',
  learnRaster: '色・構図・意味認識', learnSvg: '座標・パス・レイヤー', learnCode: '関数・反復・デバッグ', learn3d: '頂点・面・法線・素材', learnStructure: '階層・属性・関係',
  themeFox: '守護する狐', themeOwl: '星空のフクロウ', themeTurtle: '深海の海亀', themeWolf: '雷をまとう狼',
} as const

export type TranslationKey = keyof typeof ja

const en: Record<TranslationKey, string> = {
  languageJapanese: '日本語', languageEnglish: 'English', switchToLight: 'Switch to light mode', switchToDark: 'Switch to dark mode',
  heroEyebrow: 'ANYTHING CAN ENTER THE ARENA', heroTitle1: 'Turn any creation', heroTitle2: 'into a playable being.', heroDescription: 'Convert an image into semantic essence and summon it into a 3D colosseum. Meaningful expression—not raw generation volume—creates strength.',
  progressLabel: 'Progress', stepSummon: 'Summon', stepAnalyze: 'Analyze', stepBattle: '3D Battle', stepEvolution: 'Evolve',
  summonLab: 'Summoning Lab', coreCapacity: 'Core capacity', apiFree: 'NO API · LOCAL MODE', localLuna: 'LOCAL + LUNA',
  artifactChoose: 'Choose Artifact', yourArtifact: 'YOUR ARTIFACT', analyze: 'Analyze meaning', analyzeLocal: 'Analyze locally', analyzing: 'Analyzing…',
  battleMode: 'Battle mode', battleModeDescription: 'LOCAL CPU needs no API. Only online play uses a Worker connection.', workerMissing: 'Battle Worker is not configured', workerMissingDescription: 'Set VITE_BATTLE_WORKER_URL to a Cloudflare Worker URL. LOCAL CPU remains fully playable.',
  newRoomId: 'Create a new room ID', startCpu: 'Start CPU Battle in 3D Colosseum', readyPet: 'READY this PET', waitOpponent: 'Waiting for opponent READY…', connectingArena: 'Connecting to online colosseum…', reconnectRoom: 'Reconnect room', connectRoom: 'Connect room',
  coreJourney: 'CORE JOURNEY', growthLab: 'Growth & Evolution Lab', growthDescription: 'Build a learning history through battle choices and creative quests—not wins alone.', nextUnlock: 'Next unlock “{name}” in {xp} XP', allUnlocked: 'All Core Levels unlocked',
  battles: 'BATTLES', wins: 'WINS', streak: 'STREAK', quests: 'QUESTS', masteryLabel: 'Action mastery', physicalMastery: 'Physical mastery {value}', magicMastery: 'Magic mastery {value}', defenseMastery: 'Defense mastery {value}', roadmap: 'Core Level roadmap',
  questTitle: 'Source-image-free Vector Model', unlockInWins: 'Reach Core Level 2 in about four wins', questLockedDescription: 'After unlocking, choose a theme such as a fox, owl, or turtle and follow Observe → Decompose → Build → Verify guidance to create an SVG model.',
  themeLabel: '1. Creation theme (animal, etc.)', focusLabel: '2. Learning focus', focusSilhouette: 'Silhouette', focusLayers: 'Layers', focusSymbol: 'Symbolism', primaryColor: 'Primary color', glowColor: 'Glow color', buildSvg: 'Generate guidance and build SVG model',
  noSourceImage: 'NO SOURCE IMAGE', thinkStructure: 'Design the structure from a theme', thinkStructureDescription: 'Choose the conditions on the left to build an SVG without referencing an external image.', reflectionLabel: '3. Explain what and how you built', reflectionPlaceholder: 'Example: I split the ears and tail into triangles and curves, then checked the fox remained readable at small size.', saveEvidence: 'Save as learning evidence and evolve PET', portfolio: 'Learning Portfolio',
  petParameters: 'Your PET Core Parameters', parameterAnalysis: 'Parameter Analysis', physical: 'Physical', magic: 'Magic', defense: 'Defense', physicalCommandNote: 'Interrupts Magic', magicCommandNote: 'Pierces Defense', defenseCommandNote: 'Counters Physical', battleActions: 'Battle actions',
  fullscreenOpen: 'Open battle fullscreen', fullscreenClose: 'Exit battle fullscreen', backSummon: 'Summoning Lab', backSummonLong: 'Back to Summoning Lab', evolutionLab: 'Evolution Lab', rematch: 'Rematch', actionVariety: 'Action variety +{value}', calculatingResult: 'Calculating battle result and mastery…',
  levelUp: 'Evolved to CORE LEVEL {level}. {unlock} unlocked.', xpRemaining: '{xp} XP until the next unlock. Grow through multiple battles and creative quests.', maxLevel: 'All Core Levels are unlocked.',
  footer: 'PETBATTLE · A battle prototype for understanding and growing expression',
  messageSample: 'This is a sample PET. Replace it with any supported artifact.', messageApiFree: 'Local mode needs no API. Image analysis and CPU battles work as-is.', messageDescend: 'Descending from an aerial view into the colosseum.', messageOnlinePrompt: 'Connect to a room to READY your PET parameters.', messageEvolutionPrompt: 'Choose a theme to break creation into four learning stages.',
  battleStart: 'BATTLE START — Choose an action.', battleSkip: 'BATTLE START — Intro skipped.', summonSequence: 'Summoning sequence started. Descending into the colosseum…', fullscreenError: 'Fullscreen could not start. Check your browser fullscreen settings.',
  opponentHiddenContract: 'Opponent remains hidden until BATTLE START',
  unlockRaster: 'Raster Images', unlockSvg: 'SVG Vector Model', unlockCode: 'Code Effects', unlock3d: '3D Models', unlockStructure: 'Structured Artifacts',
  learnRaster: 'Color, composition, meaning', learnSvg: 'Coordinates, paths, layers', learnCode: 'Functions, loops, debugging', learn3d: 'Vertices, faces, normals, materials', learnStructure: 'Hierarchy, attributes, relationships',
  themeFox: 'Guardian Fox', themeOwl: 'Starlight Owl', themeTurtle: 'Deep-sea Turtle', themeWolf: 'Thunder Wolf',
}

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { ja, en }

export function translate(locale: Locale, key: TranslationKey, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    dictionaries[locale][key],
  )
}

export function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem('petbattle-locale')
    if (stored === 'ja' || stored === 'en') return stored
  } catch {
    // Storageなしではブラウザ言語を使う。
  }
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

export type ThemeMode = 'dark' | 'light'

export function initialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem('petbattle-theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // StorageなしではOS設定を使う。
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
