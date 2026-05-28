import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ForwardedRef, type ReactNode } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useXRift } from '@xrift/world-components'
import { BoxGeometry, ClampToEdgeWrapping, Color, Euler, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, MirroredRepeatWrapping, Quaternion, RepeatWrapping, SRGBColorSpace, Texture, Vector2, Vector3 } from 'three'
import type { BoxInstance, BoxInstanceSource, BoxPartColor } from './types'
import { missingBoxMaterial, type BoxMaterialCatalog, type BoxMaterialParameters, type BoxTextureSpec } from './materials'
import { BoxColliders } from './BuildingColliders'

// BoxLayer に渡す box 配列、material catalog、識別情報を表す。
export type BoxLayerProps = {
  id?: string
  label?: string
  collider?: boolean
  parts: BoxInstance[]
  materials: BoxMaterialCatalog
}

// 既存の InstancedBoxLayer API と互換にするための props alias。
export type InstancedBoxLayerProps = BoxLayerProps

// BoxBatchProvider に渡す children を表す。
export type BoxBatchProviderProps = {
  children: ReactNode
}

// Provider に登録される 1 つの BoxLayer の描画情報を表す。
type BoxBatchEntry = {
  id: string
  parts: BoxInstance[]
  materials: BoxMaterialCatalog
  source: BoxInstanceSource
  matrix: Matrix4
}

// BoxLayer が Provider に自身を登録するための context 値を表す。
type BoxBatchContextValue = {
  register: (entry: BoxBatchEntry) => () => void
  getProviderMatrixWorld: () => Matrix4 | null
}

const unitBoxGeometry = createUnitBoxGeometry()
const BoxBatchContext = createContext<BoxBatchContextValue | null>(null)

// 配下の BoxLayer を集約し、material key ごとにまとめて描画する。
export function BoxBatchProvider({ children }: BoxBatchProviderProps) {
  const groupRef = useRef<Group>(null)
  const [entries, setEntries] = useState<BoxBatchEntry[]>([])
  const register = useCallback((entry: BoxBatchEntry) => {
    setEntries((current) => {
      const existing = current.find((item) => item.id === entry.id)
      if (existing && areEntriesEqual(existing, entry)) {
        return current
      }

      const next = current.filter((item) => item.id !== entry.id)
      return [...next, entry]
    })

    return () => {
      setEntries((current) => current.filter((item) => item.id !== entry.id))
    }
  }, [])
  const getProviderMatrixWorld = useCallback(() => {
    if (!groupRef.current) return null

    groupRef.current.updateWorldMatrix(true, false)
    return groupRef.current.matrixWorld.clone()
  }, [])
  const contextValue = useMemo(
    () => ({ register, getProviderMatrixWorld }),
    [getProviderMatrixWorld, register],
  )

  return (
    <BoxBatchContext.Provider value={contextValue}>
      <group ref={groupRef}>
        {children}
        <BoxLayerRenderer {...mergeBatchEntries(entries)} />
      </group>
    </BoxBatchContext.Provider>
  )
}

// box instance 配列を描画する。Provider 配下では kind=boxLayer として登録だけを行う。
export const BoxLayer = forwardRef<Group, BoxLayerProps>(function BoxLayer(
  { id, label, collider = false, parts, materials },
  forwardedRef,
) {
  const batchContext = useContext(BoxBatchContext)
  const autoId = useId()
  const source = useMemo(
    () => ({
      kind: 'boxLayer' as const,
      id: id ?? autoId,
      label,
    }),
    [autoId, id, label],
  )
  const groupRef = useRef<Group>(null)
  const setGroupRefs = useCallback((group: Group | null) => {
    groupRef.current = group
    assignForwardedRef(forwardedRef, group)
  }, [forwardedRef])
  const unregisterRef = useRef<(() => void) | null>(null)
  const entryRef = useRef<BoxBatchEntry | null>(null)
  const updateRegistration = useCallback(() => {
    if (!batchContext || !groupRef.current) return

    groupRef.current.updateWorldMatrix(true, false)
    const providerMatrixWorld = batchContext.getProviderMatrixWorld()
    if (!providerMatrixWorld) return

    const matrix = getRelativeMatrix(providerMatrixWorld, groupRef.current.matrixWorld)
    const entry = {
      id: autoId,
      parts,
      materials,
      source,
      matrix,
    }
    if (entryRef.current && areEntriesEqual(entryRef.current, entry)) return

    unregisterRef.current?.()
    unregisterRef.current = batchContext.register(entry)
    entryRef.current = entry
  }, [autoId, batchContext, materials, parts, source])

  useLayoutEffect(() => {
    updateRegistration()
  }, [updateRegistration])

  useEffect(() => {
    return () => {
      unregisterRef.current?.()
      unregisterRef.current = null
      entryRef.current = null
    }
  }, [])

  useFrame(() => {
    updateRegistration()
  })

  if (batchContext) {
    return (
      <group ref={setGroupRefs}>
        {collider && <BoxColliders parts={parts} />}
      </group>
    )
  }

  return (
    <group ref={setGroupRefs}>
      <BoxLayerRenderer parts={applySource(parts, source)} materials={materials} />
      {collider && <BoxColliders parts={parts} />}
    </group>
  )
})

// forwardRef で受け取った object ref / callback ref に group を渡す。
function assignForwardedRef(ref: ForwardedRef<Group>, value: Group | null) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }

  if (ref) {
    ref.current = value
  }
}

// 登録済み entry が同じ描画内容かどうかを判定する。
function areEntriesEqual(a: BoxBatchEntry, b: BoxBatchEntry) {
  return (
    a.parts === b.parts &&
    a.materials === b.materials &&
    areSourcesEqual(a.source, b.source) &&
    matricesEqual(a.matrix, b.matrix)
  )
}

// box instance の生成元情報が同じかどうかを判定する。
function areSourcesEqual(a: BoxInstanceSource, b: BoxInstanceSource) {
  return a.kind === b.kind && a.id === b.id && a.label === b.label
}

// Matrix4 の各要素を許容誤差付きで比較する。
function matricesEqual(a: Matrix4, b: Matrix4) {
  const aElements = a.elements
  const bElements = b.elements

  for (let index = 0; index < aElements.length; index += 1) {
    if (Math.abs(aElements[index] - bElements[index]) > 0.000001) {
      return false
    }
  }

  return true
}

// Provider に登録された BoxLayer 群を 1 つの描画入力へ統合する。
function mergeBatchEntries(entries: BoxBatchEntry[]): Pick<BoxLayerProps, 'parts' | 'materials'> {
  const materials: BoxMaterialCatalog = {}
  const parts: BoxInstance[] = []

  for (const entry of entries) {
    Object.assign(materials, entry.materials)

    for (const part of entry.parts) {
      parts.push(transformPart(part, entry.matrix, part.source ?? entry.source))
    }
  }

  return { parts, materials }
}

// BoxLayer の transform を Provider ローカル座標として BoxInstance に焼き込む。
function transformPart(part: BoxInstance, matrix: Matrix4, source: BoxInstanceSource): BoxInstance {
  const localMatrix = new Matrix4()
  const transformedMatrix = new Matrix4()
  const position = new Vector3()
  const scale = new Vector3()
  const quaternion = new Quaternion()
  const euler = new Euler()

  position.set(...part.position)
  scale.set(...part.size)
  euler.set(part.rotation?.[0] ?? 0, part.rotation?.[1] ?? 0, part.rotation?.[2] ?? 0)
  quaternion.setFromEuler(euler)
  localMatrix.compose(position, quaternion, scale)
  transformedMatrix.multiplyMatrices(matrix, localMatrix)
  transformedMatrix.decompose(position, quaternion, scale)
  euler.setFromQuaternion(quaternion)

  return {
    ...part,
    position: [position.x, position.y, position.z],
    size: [scale.x, scale.y, scale.z],
    rotation: [euler.x, euler.y, euler.z],
    source,
  }
}

// child の world matrix を parent ローカル基準の matrix に変換する。
function getRelativeMatrix(parentMatrixWorld: Matrix4, childMatrixWorld: Matrix4) {
  return new Matrix4().copy(parentMatrixWorld).invert().multiply(childMatrixWorld)
}

// Provider を使わない直接描画時にも source 情報を補う。
function applySource(parts: BoxInstance[], source: BoxInstanceSource): BoxInstance[] {
  return parts.map((part) => ({
    ...part,
    source: part.source ?? source,
  }))
}

// BoxInstance 配列を material key ごとに分けて instanced mesh として描画する。
function BoxLayerRenderer({ parts, materials }: Pick<BoxLayerProps, 'parts' | 'materials'>) {
  const visibleParts = useMemo(() => parts.filter((part) => part.visible !== false), [parts])
  const groups = useMemo(() => groupByMaterial(visibleParts), [visibleParts])

  return (
    <>
      {groups.map(([materialKey, materialParts]) => (
        <InstancedBoxes
          key={materialKey}
          materialKey={materialKey}
          parts={materialParts}
          materials={materials}
        />
      ))}
    </>
  )
}

// 既存の InstancedBoxLayer 名を BoxLayer として維持する。
export const InstancedBoxLayer = BoxLayer

// material key に対応する material を選び、texture 有無で描画経路を分ける。
function InstancedBoxes({
  materialKey,
  parts,
  materials,
}: {
  materialKey: string
  parts: BoxInstance[]
  materials: BoxMaterialCatalog
}) {
  const material = materials[materialKey] ?? missingBoxMaterial

  if (material.texture) {
    return (
      <TexturedInstancedBoxes
        material={material}
        texture={material.texture}
        parts={parts}
      />
    )
  }

  return <PlainInstancedBoxes material={material} parts={parts} />
}

// texture を使わない material で instanced box を描画する。
function PlainInstancedBoxes({
  material,
  parts,
}: {
  material: BoxMaterialParameters
  parts: BoxInstance[]
}) {
  const sharedMaterial = useMemo(() => {
    const { color: _color, texture: _texture, ...rest } = material
    return rest
  }, [material])
  const meshMaterial = useMemo(() => {
    return new MeshStandardMaterial({
      ...sharedMaterial,
      color: '#ffffff',
      vertexColors: true,
    })
  }, [sharedMaterial])

  return (
    <InstancedBoxesMesh
      baseColor={material.color ?? '#ffffff'}
      material={meshMaterial}
      parts={parts}
    />
  )
}

// texture 付き material で instanced box を描画する。
function TexturedInstancedBoxes({
  material,
  texture,
  parts,
}: {
  material: BoxMaterialParameters
  texture: BoxTextureSpec
  parts: BoxInstance[]
}) {
  const { baseUrl } = useXRift()
  const textureUrl = resolveTextureUrl(baseUrl, texture.map)
  const sourceMap = useTexture(textureUrl)
  const textureConfigKey = getTextureConfigKey(texture)
  const map = useMemo(() => {
    const nextMap = sourceMap.clone()
    configureTexture(nextMap, texture)
    return nextMap
  }, [sourceMap, texture, textureConfigKey])
  const sharedMaterial = useMemo(() => {
    const { color: _color, texture: _texture, ...rest } = material
    return rest
  }, [material])
  const meshMaterial = useMemo(() => {
    const nextMaterial = new MeshStandardMaterial({
      ...sharedMaterial,
      color: '#ffffff',
      map,
      vertexColors: true,
    })
    applyBoxTextureTiling(nextMaterial, texture)
    return nextMaterial
  }, [map, sharedMaterial, texture, textureConfigKey])

  useEffect(() => {
    return () => {
      map.dispose()
    }
  }, [map])

  return (
    <InstancedBoxesMesh
      baseColor={material.color ?? '#ffffff'}
      material={meshMaterial}
      parts={parts}
    />
  )
}

// InstancedMesh に instance matrix と instance color を流し込む。
function InstancedBoxesMesh({
  baseColor,
  material,
  parts,
}: {
  baseColor: BoxPartColor
  material: MeshStandardMaterial
  parts: BoxInstance[]
}) {
  const invalidate = useThree((state) => state.invalidate)
  const instanceColors = useMemo(() => {
    const buffer = new Float32Array(parts.length * 3)
    const color = new Color()

    parts.forEach((part, index) => {
      setInstanceColor(color, part.color ?? baseColor)
      color.toArray(buffer, index * 3)
    })

    return buffer
  }, [baseColor, parts])
  const instanceColorAttribute = useMemo(
    () => new InstancedBufferAttribute(instanceColors, 3),
    [instanceColors],
  )
  const instanceSizeAttribute = useMemo(
    () => new InstancedBufferAttribute(createInstanceSizeBuffer(parts), 3),
    [parts],
  )
  const mesh = useMemo(() => {
    const geometry = unitBoxGeometry.clone()
    geometry.setAttribute('instanceSize', instanceSizeAttribute)

    const instancedMesh = new InstancedMesh(
      geometry,
      material,
      parts.length,
    )

    instancedMesh.instanceColor = instanceColorAttribute
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    return instancedMesh
  }, [instanceColorAttribute, instanceSizeAttribute, material, parts.length])

  useEffect(() => {
    return () => {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }, [mesh])

  useLayoutEffect(() => {
    mesh.geometry.setAttribute('instanceSize', instanceSizeAttribute)
    instanceSizeAttribute.needsUpdate = true
    mesh.instanceColor = instanceColorAttribute
    mesh.instanceColor.needsUpdate = true
    mesh.userData.boxInstances = parts.map((part) => ({
      id: part.id,
      materialKey: part.materialKey,
      source: part.source,
    }))

    const matrix = new Matrix4()
    const euler = new Euler()
    const position = new Vector3()
    const scale = new Vector3()
    const quaternion = new Quaternion()

    parts.forEach((part, index) => {
      position.set(...part.position)
      scale.set(...part.size)
      euler.set(part.rotation?.[0] ?? 0, part.rotation?.[1] ?? 0, part.rotation?.[2] ?? 0)
      quaternion.setFromEuler(euler)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [instanceColorAttribute, instanceSizeAttribute, invalidate, mesh, parts])

  return <primitive object={mesh} />
}

// 各 instance の実寸を shader attribute に詰める。
function createInstanceSizeBuffer(parts: BoxInstance[]) {
  const buffer = new Float32Array(parts.length * 3)

  parts.forEach((part, index) => {
    buffer[index * 3] = Math.abs(part.size[0])
    buffer[index * 3 + 1] = Math.abs(part.size[1])
    buffer[index * 3 + 2] = Math.abs(part.size[2])
  })

  return buffer
}

// tileSize 指定時だけ、box の実寸から texture UV を作る shader 差し替えを入れる。
function applyBoxTextureTiling(material: MeshStandardMaterial, texture: BoxTextureSpec) {
  const tileSize = normalizeTextureTileSize(texture.tileSize)
  if (!tileSize) {
    return
  }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.boxTextureTileSize = { value: tileSize.clone() }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <uv_pars_vertex>',
        `#include <uv_pars_vertex>
attribute vec3 instanceSize;
uniform vec2 boxTextureTileSize;

vec2 getBoxTiledMapUv(vec2 baseUv, vec3 localNormal, vec3 boxSize) {
  vec3 normalAxis = abs(localNormal);
  vec2 faceSize = vec2(boxSize.x, boxSize.y);

  if (normalAxis.y >= normalAxis.x && normalAxis.y >= normalAxis.z) {
    faceSize = vec2(boxSize.x, boxSize.z);
  } else if (normalAxis.x >= normalAxis.z) {
    faceSize = vec2(boxSize.z, boxSize.y);
  }

  return baseUv * faceSize / max(boxTextureTileSize, vec2(0.0001));
}`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = ( mapTransform * vec3( getBoxTiledMapUv( MAP_UV, normal, instanceSize ), 1 ) ).xy;
#endif`,
      )
  }
  material.customProgramCacheKey = () => `box-texture-tile:${tileSize.x}:${tileSize.y}`
}

function normalizeTextureTileSize(tileSize: BoxTextureSpec['tileSize']) {
  if (tileSize === undefined) {
    return null
  }

  if (Array.isArray(tileSize)) {
    return new Vector2(Math.max(tileSize[0], 0.0001), Math.max(tileSize[1], 0.0001))
  }

  const safeTileSize = Math.max(tileSize, 0.0001)
  return new Vector2(safeTileSize, safeTileSize)
}

function getTextureConfigKey(texture: BoxTextureSpec) {
  return JSON.stringify({
    tileSize: texture.tileSize ?? null,
    repeat: texture.repeat ?? null,
    offset: texture.offset ?? null,
    rotation: texture.rotation ?? null,
    wrap: texture.wrap ?? null,
  })
}

// XRift の baseUrl と texture path から実際の texture URL を解決する。
function resolveTextureUrl(baseUrl: string, path: string) {
  if (/^(https?:|data:|blob:)/.test(path)) {
    return path
  }

  return `${baseUrl}${path.replace(/^\/+/, '')}`
}

// texture spec を Three.js Texture に反映する。
function configureTexture(texture: Texture, spec: BoxTextureSpec) {
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = getTextureWrapping(spec.wrap)

  if (spec.repeat) {
    texture.repeat.set(spec.repeat[0], spec.repeat[1])
  }

  if (spec.offset) {
    texture.offset.set(spec.offset[0], spec.offset[1])
  }

  if (spec.rotation !== undefined) {
    texture.rotation = spec.rotation
  }

  texture.needsUpdate = true
}

// 独自の wrap 文字列を Three.js の wrapping 定数に変換する。
function getTextureWrapping(wrap: BoxTextureSpec['wrap']) {
  if (wrap === 'clamp') return ClampToEdgeWrapping
  if (wrap === 'mirror') return MirroredRepeatWrapping
  return RepeatWrapping
}

// 全頂点色を白にした共有 unit box geometry を作る。
function createUnitBoxGeometry() {
  const geometry = new BoxGeometry(1, 1, 1)
  const colorValues = new Float32Array(geometry.attributes.position.count * 3).fill(1)
  geometry.setAttribute('color', new Float32BufferAttribute(colorValues, 3))
  return geometry
}

// ColorRepresentation または RGB 配列を Three.js Color に設定する。
function setInstanceColor(target: Color, color: BoxPartColor) {
  if (Array.isArray(color)) {
    target.setRGB(color[0], color[1], color[2])
    return
  }

  target.set(color)
}

// BoxInstance 配列を materialKey ごとにまとめる。
function groupByMaterial(parts: BoxInstance[]): [string, BoxInstance[]][] {
  const groups = new Map<string, BoxInstance[]>()

  for (const part of parts) {
    const group = groups.get(part.materialKey)
    if (group) {
      group.push(part)
    } else {
      groups.set(part.materialKey, [part])
    }
  }

  return [...groups.entries()]
}
