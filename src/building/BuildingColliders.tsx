import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { Group, Matrix4, Quaternion, Vector3 } from 'three'
import type { BoxInstance } from './types'

// BoxColliders に渡す collider 対象の box 配列を表す。
export type BoxCollidersProps = {
  parts: BoxInstance[]
}

// 既存の BuildingColliders API と互換にするための props alias。
export type BuildingCollidersProps = BoxCollidersProps

// BoxInstance 配列から固定 CuboidCollider 群を生成する。
export function BoxColliders({ parts }: BoxCollidersProps) {
  const groupRef = useRef<Group>(null)
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const matrixRef = useRef<Matrix4 | null>(null)
  const mountedRef = useRef(true)
  const [colliderScale, setColliderScale] = useState<[number, number, number]>([1, 1, 1])

  const syncRigidBodyTransform = () => {
    const rigidBody = rigidBodyRef.current
    if (!mountedRef.current || !groupRef.current || !rigidBody || !isUsableRigidBody(rigidBody)) return

    groupRef.current.updateWorldMatrix(true, false)
    const matrixWorld = groupRef.current.matrixWorld
    if (matrixRef.current && matricesEqual(matrixRef.current, matrixWorld)) return

    const position = new Vector3()
    const rotation = new Quaternion()
    const scale = new Vector3()

    matrixWorld.decompose(position, rotation, scale)
    rigidBody.setTranslation(position, true)
    rigidBody.setRotation(rotation, true)
    setColliderScaleIfChanged(setColliderScale, [scale.x, scale.y, scale.z])
    matrixRef.current = matrixWorld.clone()
  }

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      matrixRef.current = null
    }
  }, [])

  useFrame(() => {
    syncRigidBodyTransform()
  })

  return (
    <group ref={groupRef}>
      <RigidBody
        ref={rigidBodyRef}
        type="fixed"
        colliders={false}
        restitution={0}
        friction={0.7}
      >
        {parts.filter((part) => part.collider !== false).map((part) => (
          <CuboidCollider
            key={part.id}
            args={[
              Math.abs(part.size[0] * colliderScale[0]) / 2,
              Math.abs(part.size[1] * colliderScale[1]) / 2,
              Math.abs(part.size[2] * colliderScale[2]) / 2,
            ]}
            position={[
              part.position[0] * colliderScale[0],
              part.position[1] * colliderScale[1],
              part.position[2] * colliderScale[2],
            ]}
            rotation={part.rotation}
          />
        ))}
      </RigidBody>
    </group>
  )
}

// 既存の BuildingColliders 名を BoxColliders として維持する。
export const BuildingColliders = BoxColliders

// Rapier の wasm raw pointer が有効な RigidBody だけを同期対象にする。
function isUsableRigidBody(rigidBody: RapierRigidBody) {
  const rawPointer = (rigidBody as { __wbg_ptr?: number }).__wbg_ptr
  return rawPointer === undefined || rawPointer !== 0
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

function setColliderScaleIfChanged(
  setColliderScale: Dispatch<SetStateAction<[number, number, number]>>,
  nextScale: [number, number, number],
) {
  setColliderScale((currentScale) => {
    if (
      Math.abs(currentScale[0] - nextScale[0]) <= 0.000001 &&
      Math.abs(currentScale[1] - nextScale[1]) <= 0.000001 &&
      Math.abs(currentScale[2] - nextScale[2]) <= 0.000001
    ) {
      return currentScale
    }

    return nextScale
  })
}
