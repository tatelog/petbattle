/**
 * Arena3D public API
 *
 * - `leftPet` / `rightPet`: `{ name, imageUrl, accentColor?, hp?, maxHp? }`.
 *   `imageUrl` accepts an imported asset URL, Blob URL, data URL, or HTTPS URL.
 * - `event`: `{ id, type, actor?, color? }`. Change `id` for every replay.
 *   `type` is physical | magic | defense | counter | ko. `actor` is the acting
 *   side, except for `ko`, where it is the defeated side.
 * - `introKey`: changing this value replays the aerial camera introduction.
 * - `showSkipButton` / `skipLabel` / `onSkipIntro`: intro skip-button API.
 * - `onIntroComplete`: called after the intro finishes or is skipped.
 * - `reducedMotion`: overrides OS `prefers-reduced-motion` when supplied.
 * - `className`: optional class for the outer container.
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, Billboard, Html, Stars, useTexture } from '@react-three/drei'
import {
  AdditiveBlending,
  DoubleSide,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PerspectiveCamera,
  type PointLight,
} from 'three'
import './arena.css'

export type ArenaSide = 'left' | 'right'

export type BattleEffectType =
  | 'physical'
  | 'magic'
  | 'defense'
  | 'counter'
  | 'ko'

export interface ArenaPet {
  name: string
  imageUrl: string
  accentColor?: string
  hp?: number
  maxHp?: number
}

export interface ArenaBattleEvent {
  id: string | number
  type: BattleEffectType
  actor?: ArenaSide
  color?: string
}

export interface Arena3DProps {
  leftPet: ArenaPet
  rightPet: ArenaPet
  event?: ArenaBattleEvent | null
  introKey?: string | number
  showSkipButton?: boolean
  skipLabel?: string
  onSkipIntro?: () => void
  onIntroComplete?: () => void
  reducedMotion?: boolean
  className?: string
}

// Portrait layouts still need both holograms fully inside the final camera.
const SIDE_X: Record<ArenaSide, number> = { left: -2.4, right: 2.4 }
const FINAL_CAMERA = { x: 0, y: 4.65, z: 10.1 }
const CAMERA_TARGET_Y = 1.5
const INTRO_DURATION = 4.8
const FALLBACK_TEXTURE =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22720%22 viewBox=%220 0 600 720%22%3E%3Cdefs%3E%3CradialGradient id=%22g%22%3E%3Cstop stop-color=%22%2367e8f9%22/%3E%3Cstop offset=%221%22 stop-color=%22%23081627%22/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width=%22600%22 height=%22720%22 fill=%22url(%23g)%22/%3E%3Cpath d=%22M300 145 420 250 375 480 300 575 225 480 180 250Z%22 fill=%22none%22 stroke=%22%23fff%22 stroke-width=%2218%22 opacity=%22.75%22/%3E%3Ccircle cx=%22300%22 cy=%22320%22 r=%2258%22 fill=%22%23fff%22 opacity=%22.35%22/%3E%3C/svg%3E'

const EVENT_LABEL: Record<BattleEffectType, string> = {
  physical: 'PHYSICAL STRIKE',
  magic: 'ARCANE BURST',
  defense: 'AEGIS GUARD',
  counter: 'PERFECT COUNTER',
  ko: 'KNOCK OUT',
}

const EVENT_COLOR: Record<BattleEffectType, string> = {
  physical: '#ffb35c',
  magic: '#a77bff',
  defense: '#55ddff',
  counter: '#ffe06a',
  ko: '#ff496f',
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function opposite(side: ArenaSide): ArenaSide {
  return side === 'left' ? 'right' : 'left'
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return prefersReducedMotion
}

function setFinalCamera(camera: PerspectiveCamera) {
  camera.position.set(FINAL_CAMERA.x, FINAL_CAMERA.y, FINAL_CAMERA.z)
  camera.lookAt(0, CAMERA_TARGET_Y, 0)
}

interface CameraDirectorProps {
  introKey: string | number
  skipped: boolean
  reducedMotion: boolean
  event?: ArenaBattleEvent | null
  onComplete: () => void
}

function CameraDirector({
  introKey,
  skipped,
  reducedMotion,
  event,
  onComplete,
}: CameraDirectorProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const introStartedAt = useRef<number | null>(null)
  const introFinished = useRef(false)
  const completeCallback = useRef(onComplete)
  const lastEventId = useRef<string | number | undefined>(undefined)
  const effectStartedAt = useRef<number | null>(null)

  useEffect(() => {
    completeCallback.current = onComplete
  }, [onComplete])

  useEffect(() => {
    introStartedAt.current = null
    introFinished.current = false
  }, [introKey])

  useEffect(() => {
    if (!skipped && !reducedMotion) return
    setFinalCamera(camera)
    if (!introFinished.current) {
      introFinished.current = true
      completeCallback.current()
    }
  }, [camera, reducedMotion, skipped])

  useFrame(({ clock }) => {
    const now = clock.elapsedTime

    if (!introFinished.current && !skipped && !reducedMotion) {
      introStartedAt.current ??= now
      const progress = clamp01((now - introStartedAt.current) / INTRO_DURATION)
      const eased = easeInOutCubic(progress)
      const radius = lerp(17.8, FINAL_CAMERA.z, eased)
      const angle = lerp(-Math.PI * 0.55, Math.PI * 0.5, eased)
      const height = lerp(14.6, FINAL_CAMERA.y, eased)

      camera.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      )
      camera.lookAt(0, lerp(0, CAMERA_TARGET_Y, eased), 0)

      if (progress >= 1) {
        setFinalCamera(camera)
        introFinished.current = true
        completeCallback.current()
      }
      return
    }

    if (event?.id !== lastEventId.current) {
      lastEventId.current = event?.id
      effectStartedAt.current = event ? now : null
    }

    if (reducedMotion || !event || effectStartedAt.current === null) {
      setFinalCamera(camera)
      return
    }

    const age = now - effectStartedAt.current
    const shakeDuration = event.type === 'ko' ? 1.15 : 0.62
    if (age >= shakeDuration) {
      setFinalCamera(camera)
      return
    }

    const strengthByType: Record<BattleEffectType, number> = {
      physical: 0.085,
      magic: 0.035,
      defense: 0.018,
      counter: 0.12,
      ko: 0.16,
    }
    const falloff = 1 - age / shakeDuration
    const strength = strengthByType[event.type] * falloff
    camera.position.set(
      FINAL_CAMERA.x + Math.sin(age * 53) * strength,
      FINAL_CAMERA.y + Math.cos(age * 47) * strength * 0.65,
      FINAL_CAMERA.z + Math.sin(age * 41) * strength * 0.35,
    )
    camera.lookAt(0, CAMERA_TARGET_Y, 0)
  })

  return null
}

function ArenaArchitecture() {
  const wallSegments = useMemo(
    () =>
      Array.from({ length: 40 }, (_, index) => {
        const angle = (index / 40) * Math.PI * 2
        return {
          angle,
          position: [
            Math.cos(angle) * 11.25,
            2.35,
            Math.sin(angle) * 11.25,
          ] as [number, number, number],
        }
      }),
    [],
  )
  const floorRays = useMemo(
    () => Array.from({ length: 12 }, (_, index) => (index / 12) * Math.PI * 2),
    [],
  )
  const torches = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2 + Math.PI / 8
        return {
          position: [
            Math.cos(angle) * 8.1,
            1.75,
            Math.sin(angle) * 8.1,
          ] as [number, number, number],
        }
      }),
    [],
  )

  return (
    <group>
      <mesh receiveShadow position={[0, -0.35, 0]}>
        <cylinderGeometry args={[7.65, 7.95, 0.7, 72]} />
        <meshStandardMaterial color="#5d5149" roughness={0.93} metalness={0.04} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[7.45, 72]} />
        <meshStandardMaterial color="#8a7461" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
        <ringGeometry args={[2.1, 2.18, 72]} />
        <meshBasicMaterial color="#d5b677" transparent opacity={0.45} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
        <ringGeometry args={[5.55, 5.64, 72]} />
        <meshBasicMaterial color="#342a29" transparent opacity={0.56} />
      </mesh>
      {floorRays.map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * 3.85, 0.027, Math.sin(angle) * 3.85]}
          rotation={[0, -angle, 0]}
        >
          <boxGeometry args={[0.045, 0.018, 7.2]} />
          <meshBasicMaterial color="#d7b87e" transparent opacity={0.22} />
        </mesh>
      ))}

      {[8.1, 9.15, 10.15].map((radius, index) => (
        <mesh
          key={radius}
          receiveShadow
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.45 + index * 0.63, 0]}
        >
          <torusGeometry args={[radius, 0.52, 9, 80]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? '#66584f' : '#79685a'}
            roughness={0.96}
          />
        </mesh>
      ))}

      {wallSegments.map(({ angle, position }, index) => (
        <group key={index} position={position} rotation={[0, -angle + Math.PI / 2, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.63, 3.45, 0.62]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? '#716057' : '#66564f'}
              roughness={0.92}
            />
          </mesh>
          {index % 2 === 0 && (
            <>
              <mesh castShadow position={[-0.66, 0.05, -0.24]}>
                <cylinderGeometry args={[0.17, 0.22, 4.15, 10]} />
                <meshStandardMaterial color="#988274" roughness={0.88} />
              </mesh>
              <mesh castShadow position={[0.66, 0.05, -0.24]}>
                <cylinderGeometry args={[0.17, 0.22, 4.15, 10]} />
                <meshStandardMaterial color="#988274" roughness={0.88} />
              </mesh>
              <mesh castShadow position={[0, 1.72, -0.25]}>
                <boxGeometry args={[1.62, 0.26, 0.82]} />
                <meshStandardMaterial color="#a28a77" roughness={0.9} />
              </mesh>
            </>
          )}
          {index % 5 === 0 && (
            <mesh position={[0, 0.45, -0.34]}>
              <planeGeometry args={[0.72, 1.72]} />
              <meshStandardMaterial
                color={index % 10 === 0 ? '#6d1833' : '#173e55'}
                roughness={0.8}
                side={DoubleSide}
              />
            </mesh>
          )}
        </group>
      ))}

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.18, 0]}>
        <torusGeometry args={[11.25, 0.3, 10, 80]} />
        <meshStandardMaterial color="#a38a72" roughness={0.9} />
      </mesh>

      {torches.map(({ position }, index) => (
        <group key={index} position={position}>
          <mesh castShadow position={[0, -0.55, 0]}>
            <cylinderGeometry args={[0.12, 0.2, 1.1, 8]} />
            <meshStandardMaterial color="#30251f" metalness={0.55} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <sphereGeometry args={[0.16, 10, 8]} />
            <meshBasicMaterial color="#ffb24d" toneMapped={false} />
          </mesh>
          {index % 2 === 0 && (
            <pointLight color="#ff8b3d" intensity={8} distance={4.8} decay={2} />
          )}
        </group>
      ))}
    </group>
  )
}

interface PetStandProps {
  side: ArenaSide
  pet: ArenaPet
  introKey: string | number
  skipped: boolean
  reducedMotion: boolean
  knockedOut: boolean
  koEventId?: string | number
}

function HologramFrame({ color }: { color: string }) {
  return (
    <group position={[0, 0, 0.065]}>
      <mesh position={[0, 1.39, 0]}>
        <boxGeometry args={[2.38, 0.055, 0.045]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, -1.39, 0]}>
        <boxGeometry args={[2.38, 0.055, 0.045]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[-1.19, 0, 0]}>
        <boxGeometry args={[0.055, 2.82, 0.045]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[1.19, 0, 0]}>
        <boxGeometry args={[0.055, 2.82, 0.045]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

function PetStand({
  side,
  pet,
  introKey,
  skipped,
  reducedMotion,
  knockedOut,
  koEventId,
}: PetStandProps) {
  const color = pet.accentColor ?? (side === 'left' ? '#5ce7ff' : '#ff70ca')
  const texture = useTexture(pet.imageUrl.trim() || FALLBACK_TEXTURE)
  const stand = useRef<Group>(null)
  const floatingCard = useRef<Group>(null)
  const scanLine = useRef<Mesh>(null)
  const entranceStartedAt = useRef<number | null>(null)
  const koStartedAt = useRef<number | null>(null)
  const maxHp = Math.max(1, pet.maxHp ?? 100)
  const hp = Math.max(0, Math.min(maxHp, pet.hp ?? maxHp))
  const hpPercent = `${(hp / maxHp) * 100}%`

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    texture.needsUpdate = true
  }, [texture])

  useEffect(() => {
    entranceStartedAt.current = null
  }, [introKey])

  useEffect(() => {
    koStartedAt.current = null
  }, [koEventId])

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    entranceStartedAt.current ??= time
    const entranceAge = time - entranceStartedAt.current
    const entranceDelay = side === 'left' ? 2.5 : 4.12
    const entranceDuration = side === 'left' ? 1.55 : 0.62
    const entranceProgress = skipped || reducedMotion
      ? 1
      : easeOutCubic(clamp01((entranceAge - entranceDelay) / entranceDuration))
    const direction = side === 'left' ? -1 : 1
    if (stand.current) {
      stand.current.visible = skipped || reducedMotion || entranceAge >= entranceDelay
      stand.current.position.set(
        SIDE_X[side] + direction * (1 - entranceProgress) * 4.1,
        -0.55 * (1 - entranceProgress),
        0,
      )
      stand.current.scale.setScalar(0.72 + entranceProgress * 0.28)
    }

    const card = floatingCard.current
    if (!card) return

    const hover = reducedMotion ? 0 : Math.sin(time * 1.55 + (side === 'left' ? 0 : 1.3)) * 0.085
    let koProgress = 0
    if (knockedOut && !reducedMotion) {
      koStartedAt.current ??= time
      koProgress = easeOutCubic(clamp01((time - koStartedAt.current) / 1.5))
    }

    card.position.y = hover - koProgress * 0.72
    card.rotation.z = (side === 'left' ? -1 : 1) * koProgress * 0.24
    card.scale.setScalar(1 - koProgress * 0.13)

    if (scanLine.current) {
      scanLine.current.position.y = reducedMotion ? 0 : ((time * 0.8) % 2.7) - 1.35
    }
  })

  return (
    <group ref={stand} position={[SIDE_X[side], 0, 0]}>
      <mesh receiveShadow position={[0, 0.13, 0]}>
        <cylinderGeometry args={[1.34, 1.55, 0.34, 40]} />
        <meshStandardMaterial color="#332c32" metalness={0.5} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <torusGeometry args={[1.03, 0.055, 8, 40]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.72, 1.05, 2.6, 32, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.07}
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>

      <group ref={floatingCard} position={[0, 0, 0]}>
        <Billboard position={[0, 2.02, 0]}>
          <mesh position={[0, 0, -0.035]}>
            <planeGeometry args={[2.48, 2.92]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.16}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh>
            <planeGeometry args={[2.26, 2.68]} />
            <meshBasicMaterial
              map={texture}
              transparent
              alphaTest={0.015}
              opacity={knockedOut ? 0.58 : 0.94}
              side={DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <HologramFrame color={color} />
          <mesh ref={scanLine} position={[0, -1.25, 0.09]}>
            <planeGeometry args={[2.22, 0.065]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.55}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
          <Html center position={[0, -1.72, 0]} distanceFactor={8.4} zIndexRange={[20, 0]}>
            <div
              className="arena3d__pet-label"
              style={{ '--arena-accent': color } as CSSProperties}
            >
              <strong>{pet.name}</strong>
              <div className="arena3d__hp-track" aria-label={`HP ${hp} / ${maxHp}`}>
                <span style={{ width: hpPercent }} />
              </div>
              <small>
                {hp} / {maxHp}
              </small>
            </div>
          </Html>
        </Billboard>
      </group>
    </group>
  )
}

function LoadingPetStand({ side, color }: { side: ArenaSide; color: string }) {
  return (
    <group position={[SIDE_X[side], 2.02, 0]}>
      <mesh>
        <planeGeometry args={[2.26, 2.68]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} />
      </mesh>
    </group>
  )
}

interface EffectProps {
  sourceX: number
  targetX: number
  color: string
  reducedMotion: boolean
}

function PhysicalEffect({ sourceX, targetX, color, reducedMotion }: EffectProps) {
  const slash = useRef<Group>(null)
  const impact = useRef<Group>(null)
  const startedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime
    const duration = reducedMotion ? 0.72 : 1.05
    const progress = clamp01((clock.elapsedTime - startedAt.current) / duration)
    const flight = easeOutCubic(clamp01(progress / 0.68))

    if (slash.current) {
      slash.current.visible = progress < 0.76
      slash.current.position.set(
        reducedMotion ? targetX : lerp(sourceX, targetX, flight),
        1.92 + (reducedMotion ? 0 : Math.sin(flight * Math.PI) * 0.5),
        0.44,
      )
      slash.current.rotation.z = lerp(-0.65, 0.45, flight)
      slash.current.scale.setScalar(0.72 + flight * 0.52)
    }
    if (impact.current) {
      const impactProgress = clamp01((progress - 0.58) / 0.34)
      impact.current.visible = progress >= 0.55 && progress < 0.96
      impact.current.scale.setScalar(0.25 + easeOutCubic(impactProgress) * 1.65)
      impact.current.rotation.z = impactProgress * 1.8
    }
  })

  return (
    <group>
      <group ref={slash}>
        <mesh rotation={[0, 0, -0.35]}>
          <torusGeometry args={[0.78, 0.075, 8, 42, Math.PI * 1.28]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.95}
            toneMapped={false}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <mesh rotation={[0, 0, 0.18]} scale={0.68}>
          <torusGeometry args={[0.78, 0.045, 8, 42, Math.PI * 1.28]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.8}
            toneMapped={false}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
      <group ref={impact} position={[targetX, 1.95, 0.48]}>
        <mesh>
          <torusGeometry args={[0.58, 0.055, 8, 40]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.9}
            toneMapped={false}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <mesh
            key={index}
            position={[
              Math.cos((index / 6) * Math.PI * 2) * 0.75,
              Math.sin((index / 6) * Math.PI * 2) * 0.75,
              0,
            ]}
            rotation={[0, 0, (index / 6) * Math.PI * 2]}
          >
            <boxGeometry args={[0.34, 0.035, 0.035]} />
            <meshBasicMaterial color="#fff6d7" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

const MAGIC_PARTICLES = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2
  const radius = 0.42 + (index % 3) * 0.14
  return [
    Math.cos(angle) * radius,
    Math.sin(angle * 1.7) * 0.42,
    Math.sin(angle) * radius,
  ] as [number, number, number]
})

function MagicEffect({ sourceX, targetX, color, reducedMotion }: EffectProps) {
  const orb = useRef<Group>(null)
  const particleOrbit = useRef<Group>(null)
  const impact = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  const startedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime
    const duration = reducedMotion ? 0.85 : 1.5
    const progress = clamp01((clock.elapsedTime - startedAt.current) / duration)
    const flight = easeInOutCubic(clamp01(progress / 0.72))

    if (orb.current) {
      orb.current.visible = progress < 0.79
      orb.current.position.set(
        reducedMotion ? targetX : lerp(sourceX, targetX, flight),
        2.15 + (reducedMotion ? 0 : Math.sin(flight * Math.PI) * 1.35),
        0.45,
      )
      orb.current.scale.setScalar(0.55 + Math.sin(progress * Math.PI * 7) * 0.08)
    }
    if (particleOrbit.current && !reducedMotion) {
      particleOrbit.current.rotation.y += 0.075
      particleOrbit.current.rotation.z -= 0.038
    }
    if (light.current) light.current.intensity = progress < 0.78 ? 14 : 0
    if (impact.current) {
      const impactProgress = clamp01((progress - 0.67) / 0.28)
      impact.current.visible = progress > 0.64 && progress < 0.98
      impact.current.scale.setScalar(0.2 + easeOutCubic(impactProgress) * 2.25)
      impact.current.rotation.z = impactProgress * 1.35
    }
  })

  return (
    <group>
      <group ref={orb}>
        <mesh>
          <sphereGeometry args={[0.36, 24, 18]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh scale={1.55}>
          <sphereGeometry args={[0.36, 18, 12]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.18}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <group ref={particleOrbit}>
          {MAGIC_PARTICLES.map((position, index) => (
            <mesh key={index} position={position} scale={index % 2 === 0 ? 0.065 : 0.04}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          ))}
        </group>
        <pointLight ref={light} color={color} intensity={14} distance={6} decay={2} />
      </group>
      <group ref={impact} position={[targetX, 2.05, 0.45]}>
        <mesh>
          <ringGeometry args={[0.42, 0.55, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.82}
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <ringGeometry args={[0.25, 0.31, 4]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.82} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

function DefenseEffect({ sourceX, color, reducedMotion }: EffectProps) {
  const shield = useRef<Group>(null)
  const shieldMaterial = useRef<MeshBasicMaterial>(null)
  const startedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime
    const duration = reducedMotion ? 0.9 : 1.65
    const progress = clamp01((clock.elapsedTime - startedAt.current) / duration)
    const appear = easeOutCubic(clamp01(progress / 0.23))
    const disappear = 1 - clamp01((progress - 0.72) / 0.28)
    const visibility = appear * disappear

    if (shield.current) {
      shield.current.visible = progress < 0.99
      shield.current.scale.setScalar(0.5 + appear * 0.62)
      if (!reducedMotion) shield.current.rotation.y = Math.sin(progress * Math.PI * 4) * 0.08
    }
    if (shieldMaterial.current) shieldMaterial.current.opacity = visibility * 0.42
  })

  return (
    <group ref={shield} position={[sourceX, 2.0, 0.48]}>
      <mesh scale={[1, 1.28, 0.32]}>
        <sphereGeometry args={[1.3, 28, 18]} />
        <meshBasicMaterial
          ref={shieldMaterial}
          color={color}
          transparent
          opacity={0.38}
          wireframe
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {[0.72, 1, 1.28].map((scale) => (
        <mesh key={scale} scale={scale}>
          <torusGeometry args={[1.02, 0.035, 8, 44]} />
          <meshBasicMaterial
            color={scale === 1 ? '#ffffff' : color}
            transparent
            opacity={0.74}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

function CounterEffect({ sourceX, targetX, color, reducedMotion }: EffectProps) {
  const shield = useRef<Group>(null)
  const streak = useRef<Group>(null)
  const impact = useRef<Group>(null)
  const startedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime
    const duration = reducedMotion ? 0.9 : 1.42
    const progress = clamp01((clock.elapsedTime - startedAt.current) / duration)
    const counterFlight = easeOutCubic(clamp01((progress - 0.3) / 0.43))
    const currentX = reducedMotion ? targetX : lerp(sourceX, targetX, counterFlight)

    if (shield.current) {
      shield.current.visible = progress < 0.58
      shield.current.scale.setScalar(0.4 + Math.sin(clamp01(progress / 0.42) * Math.PI) * 1.15)
      shield.current.rotation.z = progress * 4.5
    }
    if (streak.current) {
      streak.current.visible = progress >= 0.28 && progress < 0.78
      streak.current.position.set((sourceX + currentX) / 2, 2.05, 0.52)
      streak.current.scale.x = Math.max(0.1, Math.abs(currentX - sourceX))
    }
    if (impact.current) {
      const impactProgress = clamp01((progress - 0.66) / 0.24)
      impact.current.visible = progress >= 0.63 && progress < 0.96
      impact.current.scale.setScalar(0.2 + impactProgress * 2.3)
      impact.current.rotation.z = -impactProgress * 2.4
    }
  })

  return (
    <group>
      <group ref={shield} position={[sourceX, 2, 0.48]}>
        <mesh>
          <ringGeometry args={[0.62, 0.82, 6]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.94}
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <pointLight color={color} intensity={18} distance={5} decay={2} />
      </group>
      <group ref={streak}>
        <mesh>
          <boxGeometry args={[1, 0.07, 0.07]} />
          <meshBasicMaterial color="#fffbe7" toneMapped={false} />
        </mesh>
        <mesh scale={[1, 4, 4]}>
          <boxGeometry args={[1, 0.07, 0.07]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
      <group ref={impact} position={[targetX, 2.05, 0.52]}>
        <mesh>
          <ringGeometry args={[0.45, 0.54, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} side={DoubleSide} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 8]}>
          <ringGeometry args={[0.68, 0.74, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.72} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

const KO_SHARDS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2
  const radius = 0.38 + (index % 4) * 0.19
  return [Math.cos(angle) * radius, (index % 3) * 0.3 - 0.3, Math.sin(angle) * radius] as [
    number,
    number,
    number,
  ]
})

function KoEffect({ sourceX, color, reducedMotion }: EffectProps) {
  const root = useRef<Group>(null)
  const beamMaterial = useRef<MeshBasicMaterial>(null)
  const shards = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const startedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime
    const duration = reducedMotion ? 1 : 2.25
    const progress = clamp01((clock.elapsedTime - startedAt.current) / duration)
    const burst = easeOutCubic(clamp01(progress / 0.42))

    if (root.current) root.current.visible = progress < 0.99
    if (beamMaterial.current) {
      beamMaterial.current.opacity = Math.sin(progress * Math.PI) * 0.34
    }
    if (shards.current) {
      shards.current.position.y = reducedMotion ? 0 : burst * 2.1
      shards.current.rotation.y = reducedMotion ? 0 : progress * 4
      shards.current.scale.setScalar(0.65 + burst * 1.15)
    }
    if (ring.current) {
      ring.current.scale.setScalar(0.4 + burst * 2.7)
      ring.current.rotation.z = progress * 1.8
    }
  })

  return (
    <group ref={root} position={[sourceX, 2.05, 0.4]}>
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.72, 1.25, 6.8, 32, 1, true]} />
        <meshBasicMaterial
          ref={beamMaterial}
          color={color}
          transparent
          opacity={0.3}
          side={DoubleSide}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <group ref={ring}>
        <mesh>
          <ringGeometry args={[0.48, 0.59, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.82} side={DoubleSide} />
        </mesh>
      </group>
      <group ref={shards}>
        {KO_SHARDS.map((position, index) => (
          <mesh key={index} position={position} rotation={[index * 0.17, index * 0.31, index]}>
            <octahedronGeometry args={[0.1 + (index % 3) * 0.025]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? color : '#ffffff'}
              transparent
              opacity={0.86}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      <pointLight color={color} intensity={20} distance={7} decay={2} />
    </group>
  )
}

function BattleEffects({
  event,
  reducedMotion,
}: {
  event?: ArenaBattleEvent | null
  reducedMotion: boolean
}) {
  if (!event) return null
  const actor = event.actor ?? 'left'
  const sourceX = SIDE_X[actor]
  const targetX = SIDE_X[opposite(actor)]
  const color = event.color ?? EVENT_COLOR[event.type]
  const props = { sourceX, targetX, color, reducedMotion }

  switch (event.type) {
    case 'physical':
      return <PhysicalEffect key={event.id} {...props} />
    case 'magic':
      return <MagicEffect key={event.id} {...props} />
    case 'defense':
      return <DefenseEffect key={event.id} {...props} />
    case 'counter':
      return <CounterEffect key={event.id} {...props} />
    case 'ko':
      return <KoEffect key={event.id} {...props} />
  }
}

interface ArenaSceneProps {
  leftPet: ArenaPet
  rightPet: ArenaPet
  event?: ArenaBattleEvent | null
  introKey: string | number
  skipped: boolean
  reducedMotion: boolean
  onIntroComplete: () => void
}

function ArenaScene({
  leftPet,
  rightPet,
  event,
  introKey,
  skipped,
  reducedMotion,
  onIntroComplete,
}: ArenaSceneProps) {
  const leftKo = event?.type === 'ko' && (event.actor ?? 'left') === 'left'
  const rightKo = event?.type === 'ko' && (event.actor ?? 'left') === 'right'

  return (
    <>
      <color attach="background" args={['#050711']} />
      <fog attach="fog" args={['#080916', 15, 34]} />
      <ambientLight intensity={0.58} color="#7c8eb8" />
      <hemisphereLight args={['#6579ba', '#241811', 1.3]} />
      <directionalLight
        castShadow
        position={[-6, 11, 7]}
        intensity={2.6}
        color="#ffe0b2"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
      />
      <spotLight
        position={[0, 10, 1]}
        angle={0.58}
        penumbra={0.72}
        intensity={28}
        color="#7bcfff"
        distance={24}
      />
      <Stars radius={38} depth={18} count={800} factor={2.2} saturation={0.25} fade speed={0.12} />

      <ArenaArchitecture />
      <Suspense
        fallback={
          <>
            <LoadingPetStand side="left" color={leftPet.accentColor ?? '#5ce7ff'} />
            <LoadingPetStand side="right" color={rightPet.accentColor ?? '#ff70ca'} />
          </>
        }
      >
        <PetStand
          side="left"
          pet={leftPet}
          introKey={introKey}
          skipped={skipped}
          reducedMotion={reducedMotion}
          knockedOut={leftKo}
          koEventId={leftKo ? event?.id : undefined}
        />
        <PetStand
          side="right"
          pet={rightPet}
          introKey={introKey}
          skipped={skipped}
          reducedMotion={reducedMotion}
          knockedOut={rightKo}
          koEventId={rightKo ? event?.id : undefined}
        />
      </Suspense>
      <BattleEffects event={event} reducedMotion={reducedMotion} />
      <CameraDirector
        introKey={introKey}
        skipped={skipped}
        reducedMotion={reducedMotion}
        event={event}
        onComplete={onIntroComplete}
      />
      <AdaptiveDpr pixelated />
    </>
  )
}

export function Arena3D({
  leftPet,
  rightPet,
  event = null,
  introKey = 0,
  showSkipButton = true,
  skipLabel = 'イントロをスキップ',
  onSkipIntro,
  onIntroComplete,
  reducedMotion,
  className = '',
}: Arena3DProps) {
  const systemReducedMotion = usePrefersReducedMotion()
  const shouldReduceMotion = reducedMotion ?? systemReducedMotion
  const [skipped, setSkipped] = useState(shouldReduceMotion)
  const [introPlaying, setIntroPlaying] = useState(!shouldReduceMotion)
  const [battleStartVisible, setBattleStartVisible] = useState(false)
  const battleStartTimer = useRef<number | null>(null)

  useEffect(() => {
    if (battleStartTimer.current !== null) {
      window.clearTimeout(battleStartTimer.current)
      battleStartTimer.current = null
    }
    setBattleStartVisible(false)
    setSkipped(shouldReduceMotion)
    setIntroPlaying(!shouldReduceMotion)
  }, [introKey, shouldReduceMotion])

  useEffect(() => () => {
    if (battleStartTimer.current !== null) {
      window.clearTimeout(battleStartTimer.current)
    }
  }, [])

  const flashBattleStart = useCallback(() => {
    if (battleStartTimer.current !== null) {
      window.clearTimeout(battleStartTimer.current)
    }
    setBattleStartVisible(true)
    battleStartTimer.current = window.setTimeout(() => {
      setBattleStartVisible(false)
      battleStartTimer.current = null
    }, shouldReduceMotion ? 450 : 1_250)
  }, [shouldReduceMotion])

  const handleIntroComplete = useCallback(() => {
    setIntroPlaying(false)
    flashBattleStart()
    onIntroComplete?.()
  }, [flashBattleStart, onIntroComplete])

  const handleSkip = useCallback(() => {
    setSkipped(true)
    setIntroPlaying(false)
    flashBattleStart()
    onSkipIntro?.()
  }, [flashBattleStart, onSkipIntro])

  const classes = ['arena3d', className].filter(Boolean).join(' ')

  return (
    <section className={classes} aria-label="PETBATTLE 3Dバトルコロシアム">
      <Canvas
        className="arena3d__canvas"
        camera={{
          position: [0, 14.6, -17.8],
          fov: 43,
          near: 0.1,
          far: 80,
        }}
        dpr={[1, 1.75]}
        shadows
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <ArenaScene
          leftPet={leftPet}
          rightPet={rightPet}
          event={event}
          introKey={introKey}
          skipped={skipped}
          reducedMotion={shouldReduceMotion}
          onIntroComplete={handleIntroComplete}
        />
      </Canvas>

      <div className="arena3d__vignette" aria-hidden="true" />
      <div className="arena3d__scanlines" aria-hidden="true" />

      {introPlaying && (
        <div className="arena3d__intro-copy" aria-live="polite">
          <span>COLOSSEUM LINK ESTABLISHED</span>
          <strong>CHALLENGERS DESCENDING</strong>
        </div>
      )}

      {battleStartVisible && (
        <div className="arena3d__battle-start" role="status" aria-live="assertive">
          <span>PET CORES ONLINE</span>
          <strong>BATTLE START</strong>
        </div>
      )}

      {event && !introPlaying && (
        <div
          key={event.id}
          className={`arena3d__event-badge arena3d__event-badge--${event.type}`}
          aria-live="polite"
        >
          {EVENT_LABEL[event.type]}
        </div>
      )}

      {showSkipButton && introPlaying && !shouldReduceMotion && (
        <button type="button" className="arena3d__skip" onClick={handleSkip}>
          {skipLabel}
          <span aria-hidden="true">››</span>
        </button>
      )}
    </section>
  )
}

export default Arena3D
