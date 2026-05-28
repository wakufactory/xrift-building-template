import { useFrame } from '@react-three/fiber'
import { useUsers } from '@xrift/world-components'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { DirectionalLight, Object3D, Vector3 } from 'three'

type Vec3 = [number, number, number]

export type PlayerShadowLightProps = {
  direction?: Vec3
  intensity?: number
  shadowSize?: number
  shadowDepth?: number
  shadowDistance?: number
  snap?: number
  targetHeight?: number
  mapSize?: number
  bias?: number
  normalBias?: number
}

const defaultDirection: Vec3 = [8, 24, 16]

// 自分のユーザ位置を中心に、平行光源の shadow camera を追従させる。
//
// directionalLight の照明方向は `direction` で決まるが、影はライトに付属する
// orthographic camera で一度シーンを描画して作られる。そのため広いワールドでは
// 固定の shadow camera 範囲だと、ユーザから離れた場所に解像度を使いすぎたり、
// 逆に現在見ている屋根・壁・床の影が範囲外で切れたりする。
//
// このコンポーネントは、毎フレーム `useUsers().getLocalMovement()` から自分の
// 現在位置を取得し、その周辺だけを shadow map に収める。光の向きは保ったまま
// light/target をユーザ周辺へ移動するので、見た目の太陽方向は変えずに
// 「影を作る範囲」だけをプレイヤーに追従させる。
export function PlayerShadowLight({
  direction = defaultDirection,
  intensity = 2.2,
  shadowSize = 44,
  shadowDepth = 70,
  shadowDistance = 80,
  snap = 1,
  targetHeight = 4,
  mapSize = 1024,
  bias = -0.0001,
  normalBias = 0.04,
}: PlayerShadowLightProps) {
  const lightRef = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const { getLocalMovement } = useUsers()
  const lightDirection = useMemo(() => {
    // `direction` はライトを target からどちら側に置くかを表す。
    // Three.js の directionalLight は `position -> target` の向きで照らすため、
    // target をユーザ周辺に置き、position をこの方向へ距離分だけ離す。
    return new Vector3(...direction).normalize()
  }, [direction])

  useLayoutEffect(() => {
    const light = lightRef.current
    if (!light) return
    // JSX の `<directionalLight target={...}>` では Object3D の更新順が読みづらいので、
    // 明示的に target を差し替える。target 自体も scene に primitive として追加する。
    light.target = target
  }, [target])

  useFrame(() => {
    const light = lightRef.current
    if (!light) return

    const movement = getLocalMovement()
    // shadow camera を毎フレーム連続的に動かすと、shadow map の texel と
    // ワールド座標の対応が細かくずれて影がちらつきやすい。XZ は snap 単位に
    // 丸め、ユーザが一定距離動いたときだけ影範囲が移るようにする。
    const centerX = snapValue(movement.position.x, snap)
    const centerZ = snapValue(movement.position.z, snap)
    // 足元そのものではなく少し上を target にする。2 階建て程度の建物では
    // shadow camera の中心を床面より上げた方が、屋根と地面の両方を奥行き範囲に
    // 入れやすい。
    const centerY = movement.position.y + targetHeight

    target.position.set(centerX, centerY, centerZ)
    light.position.copy(target.position).addScaledVector(lightDirection, shadowDistance)
    target.updateMatrixWorld()
    light.updateMatrixWorld()

    const camera = light.shadow.camera
    const halfSize = shadowSize / 2
    // orthographic shadow camera の X/Y 範囲。値を大きくすると広い範囲の影が
    // 切れにくくなる一方、同じ mapSize を広く引き伸ばすため影の解像度は落ちる。
    camera.left = -halfSize
    camera.right = halfSize
    camera.top = halfSize
    camera.bottom = -halfSize
    // camera の奥行き範囲。light は target から `shadowDistance` 離れているため、
    // target 周辺を中心に `shadowDepth` 分だけ前後へ含める。near/far を必要以上に
    // 広げると shadow map の精度が落ちるので、建物高さと周辺地面に足りる程度にする。
    camera.near = Math.max(0.1, shadowDistance - shadowDepth / 2)
    camera.far = shadowDistance + shadowDepth / 2
    camera.updateProjectionMatrix()
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={lightRef}
        intensity={intensity}
        castShadow
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-bias={bias}
        shadow-normalBias={normalBias}
      />
    </>
  )
}

function snapValue(value: number, snap: number) {
  if (snap <= 0) return value
  return Math.round(value / snap) * snap
}
