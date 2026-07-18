import { z } from 'zod'

/**
 * Level 1 deliberately has a fixed essence budget. File bytes, pixel count and
 * OpenAI usage tokens can never increase combat power; they only provide
 * evidence used to distribute these 16 points.
 */
export const LV1_IMAGE_POLICY = Object.freeze({
  level: 1,
  maxBytes: 2 * 1024 * 1024,
  essence: 16,
  sampleSize: 32,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
})

export const ImageMimeSchema = z.enum(LV1_IMAGE_POLICY.mimeTypes)
export type ImageMime = z.infer<typeof ImageMimeSchema>

const UnitFeatureSchema = z.number().int().min(0).max(1000)

export const CanvasFeaturesSchema = z
  .object({
    width: z.number().int().positive().max(100_000),
    height: z.number().int().positive().max(100_000),
    luminance: UnitFeatureSchema,
    saturation: UnitFeatureSchema,
    contrast: UnitFeatureSchema,
    edgeDensity: UnitFeatureSchema,
    symmetry: UnitFeatureSchema,
    warmth: UnitFeatureSchema,
    entropy: UnitFeatureSchema,
    alphaCoverage: UnitFeatureSchema,
  })
  .strict()

export type CanvasFeatures = z.infer<typeof CanvasFeaturesSchema>

export const SemanticEssenceSchema = z
  .object({
    physical: z.number().int().min(0).max(LV1_IMAGE_POLICY.essence),
    magic: z.number().int().min(0).max(LV1_IMAGE_POLICY.essence),
    defense: z.number().int().min(0).max(LV1_IMAGE_POLICY.essence),
  })
  .strict()
  .refine(
    (essence) => essence.physical + essence.magic + essence.defense === LV1_IMAGE_POLICY.essence,
    { message: `essenceの合計は${LV1_IMAGE_POLICY.essence}である必要があります` },
  )

export type SemanticEssence = z.infer<typeof SemanticEssenceSchema>

export const PetElementSchema = z.enum([
  'neutral',
  'fire',
  'water',
  'wind',
  'earth',
  'light',
  'shadow',
])

export const PetTemperamentSchema = z.enum(['brave', 'clever', 'guardian', 'wild', 'calm'])

export const PetTraitSchema = z.enum([
  'swift',
  'sturdy',
  'arcane',
  'radiant',
  'fierce',
  'mysterious',
  'balanced',
])

/** Small, strict shape expected from the Responses API structured output. */
export const LunaAnalysisSchema = z
  .object({
    name: z.string().trim().min(1).max(20),
    species: z.string().trim().min(1).max(28),
    element: PetElementSchema,
    temperament: PetTemperamentSchema,
    traits: z.array(PetTraitSchema).min(1).max(2),
    essence: SemanticEssenceSchema,
  })
  .strict()

export type LunaAnalysis = z.infer<typeof LunaAnalysisSchema>

/**
 * Kept beside the Zod schema so the Worker and browser validate the same
 * contract. JSON Schema cannot express the sum constraint portably, therefore
 * the prompt also says that p + m + d must be 16 and Zod verifies it again.
 */
export const LUNA_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'species', 'element', 'temperament', 'traits', 'essence'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 20 },
    species: { type: 'string', minLength: 1, maxLength: 28 },
    element: { type: 'string', enum: PetElementSchema.options },
    temperament: { type: 'string', enum: PetTemperamentSchema.options },
    traits: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: { type: 'string', enum: PetTraitSchema.options },
    },
    essence: {
      type: 'object',
      additionalProperties: false,
      required: ['physical', 'magic', 'defense'],
      properties: {
        physical: { type: 'integer', minimum: 0, maximum: LV1_IMAGE_POLICY.essence },
        magic: { type: 'integer', minimum: 0, maximum: LV1_IMAGE_POLICY.essence },
        defense: { type: 'integer', minimum: 0, maximum: LV1_IMAGE_POLICY.essence },
      },
    },
  },
} as const

export const PetStatsSchema = z
  .object({
    physical: z.number().int().positive(),
    magic: z.number().int().positive(),
    defense: z.number().int().positive(),
    hp: z.number().int().positive(),
  })
  .strict()

export type PetStats = z.infer<typeof PetStatsSchema>

export const PetManifestSchema = z
  .object({
    version: z.literal(1),
    level: z.literal(1),
    source: z
      .object({
        kind: z.literal('image'),
        origin: z.enum(['upload', 'generated']),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        mime: ImageMimeSchema,
        size: z.number().int().positive().max(LV1_IMAGE_POLICY.maxBytes),
      })
      .strict(),
    features: CanvasFeaturesSchema,
    analysisSource: z.enum(['luna', 'fallback']),
    analysis: LunaAnalysisSchema,
    stats: PetStatsSchema,
  })
  .strict()

export type PetManifest = z.infer<typeof PetManifestSchema>

export interface PixelImageData {
  width: number
  height: number
  data: ArrayLike<number>
}

export interface Level1ImageInput {
  type: string
  size: number
}

export function validateLevel1Image(input: Level1ImageInput): ImageMime {
  const mime = ImageMimeSchema.safeParse(input.type.toLowerCase())
  if (!mime.success) {
    throw new TypeError('Lv1で使える画像はJPEG・PNG・WebPです')
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new RangeError('画像ファイルが空か、サイズを確認できません')
  }
  if (input.size > LV1_IMAGE_POLICY.maxBytes) {
    throw new RangeError('Lv1の画像は2MiB以下にしてください')
  }
  return mime.data
}

const clampUnit = (value: number): number => Math.max(0, Math.min(1000, Math.round(value)))

/**
 * Extracts format-independent evidence from a fixed 32x32 nearest-neighbour
 * sample. Increasing resolution or appending metadata therefore creates no
 * extra essence. All returned features are integers in [0, 1000].
 */
export function extractCanvasFeatures(image: PixelImageData): CanvasFeatures {
  const { width, height, data } = image
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Canvasの幅と高さは正の整数である必要があります')
  }
  if (data.length < width * height * 4) {
    throw new RangeError('CanvasのRGBAピクセルデータが不足しています')
  }

  const gridWidth = Math.min(LV1_IMAGE_POLICY.sampleSize, width)
  const gridHeight = Math.min(LV1_IMAGE_POLICY.sampleSize, height)
  const sampleCount = gridWidth * gridHeight
  const lumas = new Float64Array(sampleCount)
  const reds = new Float64Array(sampleCount)
  const greens = new Float64Array(sampleCount)
  const blues = new Float64Array(sampleCount)
  const alphas = new Float64Array(sampleCount)
  const histogram = new Uint32Array(16)

  let lumaSum = 0
  let saturationSum = 0
  let warmthSum = 0
  let alphaSum = 0

  for (let gy = 0; gy < gridHeight; gy += 1) {
    const sourceY = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / gridHeight))
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / gridWidth))
      const sourceIndex = (sourceY * width + sourceX) * 4
      const sampleIndex = gy * gridWidth + gx
      const r = Number(data[sourceIndex] ?? 0)
      const g = Number(data[sourceIndex + 1] ?? 0)
      const b = Number(data[sourceIndex + 2] ?? 0)
      const a = Number(data[sourceIndex + 3] ?? 0)
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const maximum = Math.max(r, g, b)
      const minimum = Math.min(r, g, b)

      reds[sampleIndex] = r
      greens[sampleIndex] = g
      blues[sampleIndex] = b
      alphas[sampleIndex] = a
      lumas[sampleIndex] = luma
      lumaSum += luma
      saturationSum += maximum === 0 ? 0 : (maximum - minimum) / maximum
      warmthSum += (r - b + 255) / 510
      alphaSum += a / 255
      histogram[Math.min(15, Math.floor(luma / 16))] += 1
    }
  }

  const meanLuma = lumaSum / sampleCount
  let variance = 0
  let edgeSum = 0
  let edgeComparisons = 0

  for (let gy = 0; gy < gridHeight; gy += 1) {
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const index = gy * gridWidth + gx
      const delta = lumas[index]! - meanLuma
      variance += delta * delta
      if (gx > 0) {
        edgeSum += Math.abs(lumas[index]! - lumas[index - 1]!)
        edgeComparisons += 1
      }
      if (gy > 0) {
        edgeSum += Math.abs(lumas[index]! - lumas[index - gridWidth]!)
        edgeComparisons += 1
      }
    }
  }

  let symmetryDistance = 0
  let symmetryComparisons = 0
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < Math.floor(gridWidth / 2); x += 1) {
      const left = y * gridWidth + x
      const right = y * gridWidth + (gridWidth - 1 - x)
      const colorDistance =
        (Math.abs(reds[left]! - reds[right]!) +
          Math.abs(greens[left]! - greens[right]!) +
          Math.abs(blues[left]! - blues[right]!) +
          Math.abs(alphas[left]! - alphas[right]!)) /
        (4 * 255)
      symmetryDistance += colorDistance
      symmetryComparisons += 1
    }
  }

  let entropy = 0
  for (const count of histogram) {
    if (count === 0) continue
    const probability = count / sampleCount
    entropy -= probability * Math.log2(probability)
  }

  return CanvasFeaturesSchema.parse({
    width,
    height,
    luminance: clampUnit((meanLuma / 255) * 1000),
    saturation: clampUnit((saturationSum / sampleCount) * 1000),
    contrast: clampUnit((Math.sqrt(variance / sampleCount) / 127.5) * 1000),
    edgeDensity: clampUnit(edgeComparisons === 0 ? 0 : (edgeSum / edgeComparisons / 255) * 1000),
    symmetry: clampUnit(symmetryComparisons === 0 ? 1000 : (1 - symmetryDistance / symmetryComparisons) * 1000),
    warmth: clampUnit((warmthSum / sampleCount) * 1000),
    entropy: clampUnit((entropy / 4) * 1000),
    alphaCoverage: clampUnit((alphaSum / sampleCount) * 1000),
  })
}

type EssenceLike = Partial<Record<keyof SemanticEssence, number>>

const ESSENCE_KEYS = ['physical', 'magic', 'defense'] as const

/** Converts arbitrary non-negative weights into exactly 16 integer essence. */
export function normalizeEssence(
  candidate: EssenceLike,
  fallback: SemanticEssence = { physical: 6, magic: 5, defense: 5 },
): SemanticEssence {
  const weights = ESSENCE_KEYS.map((key) => {
    const value = candidate[key]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  })
  const sum = weights.reduce((total, value) => total + value, 0)
  if (sum <= 0) return SemanticEssenceSchema.parse(fallback)

  const exact = weights.map((weight) => (weight / sum) * LV1_IMAGE_POLICY.essence)
  const result = exact.map(Math.floor)
  const remaining = LV1_IMAGE_POLICY.essence - result.reduce((total, value) => total + value, 0)
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  for (let index = 0; index < remaining; index += 1) {
    result[order[index]!.index] = result[order[index]!.index]! + 1
  }
  return SemanticEssenceSchema.parse({
    physical: result[0],
    magic: result[1],
    defense: result[2],
  })
}

function stableStringSeed(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Deterministic no-network identity and essence distribution. */
export function createFallbackLunaAnalysis(features: CanvasFeatures, seed = ''): LunaAnalysis {
  const parsed = CanvasFeaturesSchema.parse(features)
  const physicalWeight =
    250 + parsed.edgeDensity * 0.42 + parsed.contrast * 0.3 + parsed.alphaCoverage * 0.18
  const magicWeight = 250 + parsed.saturation * 0.34 + parsed.entropy * 0.4 + parsed.warmth * 0.12
  const defenseWeight =
    250 + parsed.symmetry * 0.38 + parsed.alphaCoverage * 0.3 + (1000 - parsed.contrast) * 0.12
  const essence = normalizeEssence({
    physical: physicalWeight,
    magic: magicWeight,
    defense: defenseWeight,
  })

  const element = (() => {
    if (parsed.saturation < 170) return 'neutral' as const
    if (parsed.warmth > 650) return parsed.luminance > 650 ? ('light' as const) : ('fire' as const)
    if (parsed.warmth < 380) return parsed.luminance < 330 ? ('shadow' as const) : ('water' as const)
    if (parsed.symmetry > 760) return 'earth' as const
    return 'wind' as const
  })()

  const strongest = ESSENCE_KEYS.reduce((winner, key) =>
    essence[key] > essence[winner] ? key : winner,
  )
  const temperament =
    strongest === 'physical' ? ('brave' as const) : strongest === 'magic' ? ('clever' as const) : ('guardian' as const)
  const primaryTrait =
    strongest === 'physical' ? ('fierce' as const) : strongest === 'magic' ? ('arcane' as const) : ('sturdy' as const)
  const secondaryTrait = parsed.symmetry > 800 ? ('balanced' as const) : parsed.luminance > 680 ? ('radiant' as const) : ('mysterious' as const)
  const identity = stableStringSeed(
    `${seed}:${parsed.luminance}:${parsed.saturation}:${parsed.edgeDensity}:${parsed.symmetry}`,
  )

  return LunaAnalysisSchema.parse({
    name: `PET-${identity.toString(16).padStart(8, '0').slice(0, 6).toUpperCase()}`,
    species: `${element}-artifact`,
    element,
    temperament,
    traits: [primaryTrait, secondaryTrait],
    essence,
  })
}

/** The sole combat-stat formula. AI output never supplies stats directly. */
export function statsFromEssence(essenceInput: SemanticEssence): PetStats {
  const essence = SemanticEssenceSchema.parse(essenceInput)
  return PetStatsSchema.parse({
    physical: 24 + essence.physical * 6,
    magic: 24 + essence.magic * 6,
    defense: 20 + essence.defense * 7,
    hp: 96 + essence.physical * 2 + essence.magic + essence.defense * 5,
  })
}

export interface CreatePetManifestInput {
  sha256: string
  mime: string
  size: number
  features: CanvasFeatures
  luna?: unknown
  source?: 'upload' | 'generated'
}

export function createPetManifest(input: CreatePetManifestInput): PetManifest {
  const mime = validateLevel1Image({ type: input.mime, size: input.size })
  const features = CanvasFeaturesSchema.parse(input.features)
  const luna = LunaAnalysisSchema.safeParse(input.luna)
  const analysis = luna.success ? luna.data : createFallbackLunaAnalysis(features, input.sha256)

  return PetManifestSchema.parse({
    version: 1,
    level: 1,
    source: {
      kind: 'image',
      origin: input.source ?? 'upload',
      sha256: input.sha256.toLowerCase(),
      mime,
      size: input.size,
    },
    features,
    analysisSource: luna.success ? 'luna' : 'fallback',
    analysis,
    stats: statsFromEssence(analysis.essence),
  })
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function browserCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new Error('この環境ではCanvas画像解析を利用できません')
}

export async function analyzeImageFile(
  file: File,
  options: { luna?: unknown; source?: 'upload' | 'generated' } = {},
): Promise<PetManifest> {
  const mime = validateLevel1Image(file)
  const bytes = await file.arrayBuffer()
  const [sha256, bitmap] = await Promise.all([sha256Hex(bytes), createImageBitmap(file)])

  try {
    const scale = Math.min(1, LV1_IMAGE_POLICY.sampleSize / Math.max(bitmap.width, bitmap.height))
    const sampleWidth = Math.max(1, Math.round(bitmap.width * scale))
    const sampleHeight = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = browserCanvas(sampleWidth, sampleHeight)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context || !('getImageData' in context)) throw new Error('2D Canvasを初期化できませんでした')
    context.clearRect(0, 0, sampleWidth, sampleHeight)
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight)
    const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight)
    const features = {
      ...extractCanvasFeatures(imageData),
      width: bitmap.width,
      height: bitmap.height,
    }

    return createPetManifest({
      sha256,
      mime,
      size: file.size,
      features,
      luna: options.luna,
      source: options.source,
    })
  } finally {
    bitmap.close()
  }
}
