import type { ColorRepresentation } from 'three'

// XZ 平面などの 2 要素ベクトルを表す。
export type Vec2 = [number, number]

// Three.js / Rapier 座標で使う 3 要素ベクトルを表す。
export type Vec3 = [number, number, number]

// 部屋の 4 方向の壁を表す。
export type WallSide = 'north' | 'south' | 'east' | 'west'

// box instance に渡す色指定を表す。
export type BoxPartColor = ColorRepresentation | Vec3

// 壁ごとの surface 上書きを表す。
export type WallSurfaceMap = Partial<Record<WallSide, SurfaceSpec>>

// 建物全体を生成するための入力 DSL を表す。
export type BuildingPlan = {
  unit?: number
  floorHeight: number
  wallThickness: number
  slabThickness: number
  pillar?: PillarSpec
  roof?: RoofSpec | false
  materialKeys: BuildingMaterialKeys
  exteriorGround?: ExteriorGroundSpec | false
  rooms: RoomSpec[]
}

// plan 内で使うデフォルト material key 群を表す。
export type BuildingMaterialKeys = {
  room: RoomMaterials
  exteriorGround: string
  pillar: string
  roof?: string
}

// 建物外側に置く地面 box の設定を表す。
export type ExteriorGroundSpec = {
  margin?: number
  thickness?: number
  materialKey?: string
}

// 部屋角に置く柱の設定を表す。
export type PillarSpec = {
  thickness?: number
}

// room 形状に沿って分割生成する平面屋根の設定を表す。
export type RoofSpec = SurfaceSpec & {
  overhang?: number
  thickness?: number
  heightOffset?: number
}

// 1 部屋分の形状、面設定、開口を表す。
export type RoomSpec = {
  id: string
  position: Vec2
  size: Vec2
  wallThickness?: number
  surfaces?: RoomSurfaces
  doors?: OpeningSpec[]
  windows?: OpeningSpec[]
  floorOpenings?: SlabOpeningSpec[]
  ceilingOpenings?: SlabOpeningSpec[]
  roofOpenings?: SlabOpeningSpec[]
}

// 床・壁・天井などの見た目と collider の上書きを表す。
export type SurfaceSpec = {
  materialKey?: string
  color?: BoxPartColor
  hidden?: boolean
  noCollider?: boolean
}

// 互換用に SurfaceSpec と同じ意味で使う surface flags を表す。
export type SurfaceFlags = SurfaceSpec

// 部屋内の面ごとの surface 指定を表す。
export type RoomSurfaces = {
  floor?: SurfaceSpec
  wall?: SurfaceSpec
  ceiling?: SurfaceSpec
  walls?: WallSurfaceMap
}

// 壁に開けるドア・窓などの矩形開口を表す。
export type OpeningSpec = {
  side: WallSide
  offset: number
  width: number
  height?: number
  bottom?: number
}

// 床・天井・屋根 slab に開ける、部屋中心基準の矩形開口を表す。
export type SlabOpeningSpec = {
  position: Vec2
  size: Vec2
}

// 部屋の床・壁・天井に使う material key を表す。
export type RoomMaterials = {
  floor: string
  wall: string
  ceiling: string
}

// コンパイル後の box が建物内で何を表すかを分類する。
export type BoxPartKind =
  | 'floor'
  | 'exteriorGround'
  | 'wall'
  | 'ceiling'
  | 'roof'
  | 'pillar'
  | 'trim'
  | 'colliderOnly'

// 描画・物理で共有する汎用 box instance を表す。
export type BoxInstance = {
  id: string
  position: Vec3
  size: Vec3
  rotation?: Vec3
  materialKey: string
  color?: BoxPartColor
  source?: BoxInstanceSource
  visible?: boolean
  collider?: boolean
}

// 建物コンパイル結果として kind を持つ box instance を表す。
export type BoxPart = BoxInstance & {
  kind: BoxPartKind
}

// box instance がどの生成元から来たかを分類する。
export type BoxInstanceSourceKind = 'buildingWorld' | 'boxLayer'

// 統合描画後も元の BuildingWorld / BoxLayer を追跡するための情報を表す。
export type BoxInstanceSource = {
  kind: BoxInstanceSourceKind
  id?: string
  label?: string
}
