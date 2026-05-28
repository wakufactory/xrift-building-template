import type { BuildingPlan, RoomSpec, Vec2, Vec3, WallSide } from './types'

const wallSides: WallSide[] = ['north', 'south', 'east', 'west']
const CEILING_Z_FIGHT_OFFSET = 0.001

// 家具や装飾を置くための位置と回転を表す。
export type PlacementTransform = {
  position: Vec3
  rotation: Vec3
}

// 部屋の床基準で配置を計算するための入力を表す。
export type FloorPlacementInput = {
  roomId: string
  offset?: Vec2
  height?: number
  rotationY?: number
}

// 部屋の天井基準で配置を計算するための入力を表す。
export type CeilingPlacementInput = FloorPlacementInput

// 部屋の壁基準で配置を計算するための入力を表す。
export type WallPlacementInput = {
  roomId: string
  side: WallSide
  offset?: number
  height?: number
  inset?: number
}

// 部屋の床面フレームと境界を表す。
export type RoomFloorFrame = {
  room: RoomSpec
  center: Vec3
  size: Vec2
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// 部屋の天井面フレームと境界を表す。
export type RoomCeilingFrame = RoomFloorFrame

// 部屋の壁面フレーム、接線、内向き法線を表す。
export type RoomWallFrame = {
  room: RoomSpec
  side: WallSide
  center: Vec3
  length: number
  tangent: Vec3
  inwardNormal: Vec3
  rotation: Vec3
}

// plan.unit を反映した建物全体の寸法と基本高さを表す。
export type BuildingInfo = {
  plan: BuildingPlan
  unit: number
  rooms: RoomSpec[]
  center: Vec3
  size: Vec3
  floorHeight: number
  wallThickness: number
  slabThickness: number
  floorTopY: number
  ceilingY: number
  ceilingBottomY: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// plan.unit を反映した 1 room の寸法、境界、床・壁 frame を表す。
export type RoomInfo = {
  room: RoomSpec
  id: string
  position: Vec2
  size: Vec2
  width: number
  depth: number
  wallThickness: number
  center: Vec3
  floorTopY: number
  ceilingY: number
  ceilingBottomY: number
  floorFrame: RoomFloorFrame
  ceilingFrame: RoomCeilingFrame
  walls: Record<WallSide, RoomWallFrame>
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// plan.unit を反映した建物全体の寸法と基本高さを取得する。
export function getBuildingInfo(plan: BuildingPlan): BuildingInfo {
  const unit = plan.unit ?? 1
  const rooms = plan.rooms.map((room) => scaleRoom(room, unit))
  const bounds = getRoomBounds(rooms)
  const floorHeight = plan.floorHeight * unit
  const slabThickness = plan.slabThickness * unit
  const wallThickness = plan.wallThickness * unit
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ

  return {
    plan,
    unit,
    rooms,
    center: [
      bounds.minX + width / 2,
      floorHeight / 2,
      bounds.minZ + depth / 2,
    ],
    size: [width, floorHeight, depth],
    floorHeight,
    wallThickness,
    slabThickness,
    floorTopY: slabThickness,
    ceilingY: floorHeight - slabThickness,
    ceilingBottomY: floorHeight - slabThickness - CEILING_Z_FIGHT_OFFSET,
    ...bounds,
  }
}

// plan.unit を反映した指定 room の寸法、境界、床・壁 frame を取得する。
export function getRoomInfo(plan: BuildingPlan, roomId: string): RoomInfo {
  const unit = plan.unit ?? 1
  const floorFrame = getRoomFloorFrame(plan, roomId)
  const ceilingFrame = getRoomCeilingFrame(plan, roomId)
  const [width, depth] = floorFrame.size
  const wallThickness = getEffectiveRoomWallThickness(plan, floorFrame.room, unit)
  const wallFrames = Object.fromEntries(
    wallSides.map((side) => [side, getRoomWallFrame(plan, { roomId, side })]),
  ) as Record<WallSide, RoomWallFrame>

  return {
    room: floorFrame.room,
    id: floorFrame.room.id,
    position: floorFrame.room.position,
    size: floorFrame.size,
    width,
    depth,
    wallThickness,
    center: [
      floorFrame.center[0],
      (plan.floorHeight * unit) / 2,
      floorFrame.center[2],
    ],
    floorTopY: plan.slabThickness * unit,
    ceilingY: (plan.floorHeight - plan.slabThickness) * unit,
    ceilingBottomY: ceilingFrame.center[1],
    floorFrame,
    ceilingFrame,
    walls: wallFrames,
    minX: floorFrame.minX,
    maxX: floorFrame.maxX,
    minZ: floorFrame.minZ,
    maxZ: floorFrame.maxZ,
  }
}

// 指定 room の床面中心と境界を取得する。
export function getRoomFloorFrame(plan: BuildingPlan, roomId: string): RoomFloorFrame {
  const unit = plan.unit ?? 1
  const sourceRoom = getRoom(plan, roomId)
  const room = scaleRoom(sourceRoom, unit)
  const [x, z] = room.position
  const [width, depth] = room.size
  const floorTopY = plan.slabThickness * unit

  return {
    room,
    center: [x, floorTopY, z],
    size: [width, depth],
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  }
}

// 指定 room の天井面中心と境界を取得する。
export function getRoomCeilingFrame(plan: BuildingPlan, roomId: string): RoomCeilingFrame {
  const unit = plan.unit ?? 1
  const sourceRoom = getRoom(plan, roomId)
  const room = scaleRoom(sourceRoom, unit)
  const [x, z] = room.position
  const [width, depth] = room.size
  const ceilingBottomY = (plan.floorHeight - plan.slabThickness) * unit - CEILING_Z_FIGHT_OFFSET

  return {
    room,
    center: [x, ceilingBottomY, z],
    size: [width, depth],
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  }
}

// 指定 room の指定壁に沿った配置用フレームを取得する。
export function getRoomWallFrame(plan: BuildingPlan, input: Pick<WallPlacementInput, 'roomId' | 'side'>): RoomWallFrame {
  const unit = plan.unit ?? 1
  const sourceRoom = getRoom(plan, input.roomId)
  const room = scaleRoom(sourceRoom, unit)
  const [x, z] = room.position
  const [width, depth] = room.size
  const wallThickness = getEffectiveRoomWallThickness(plan, room, unit)
  const centerY = plan.floorHeight * unit / 2

  switch (input.side) {
    case 'north':
      return {
        room,
        side: input.side,
        center: [x, centerY, z - depth / 2 + wallThickness / 2],
        length: width,
        tangent: [1, 0, 0],
        inwardNormal: [0, 0, 1],
        rotation: [0, 0, 0],
      }
    case 'south':
      return {
        room,
        side: input.side,
        center: [x, centerY, z + depth / 2 - wallThickness / 2],
        length: width,
        tangent: [1, 0, 0],
        inwardNormal: [0, 0, -1],
        rotation: [0, Math.PI, 0],
      }
    case 'east':
      return {
        room,
        side: input.side,
        center: [x + width / 2 - wallThickness / 2, centerY, z],
        length: depth,
        tangent: [0, 0, -1],
        inwardNormal: [-1, 0, 0],
        rotation: [0, -Math.PI / 2, 0],
      }
    case 'west':
      return {
        room,
        side: input.side,
        center: [x - width / 2 + wallThickness / 2, centerY, z],
        length: depth,
        tangent: [0, 0, -1],
        inwardNormal: [1, 0, 0],
        rotation: [0, Math.PI / 2, 0],
      }
  }
}

// 床面基準の offset と高さから world 配置を計算する。
export function getFloorPlacement(plan: BuildingPlan, input: FloorPlacementInput): PlacementTransform {
  const unit = plan.unit ?? 1
  const frame = getRoomFloorFrame(plan, input.roomId)
  const [offsetX, offsetZ] = input.offset ?? [0, 0]

  return {
    position: [
      frame.center[0] + offsetX * unit,
      frame.center[1] + (input.height ?? 0) * unit,
      frame.center[2] + offsetZ * unit,
    ],
    rotation: [0, input.rotationY ?? 0, 0],
  }
}

// 天井面基準の offset と下方向距離から world 配置を計算する。
export function getCeilingPlacement(plan: BuildingPlan, input: CeilingPlacementInput): PlacementTransform {
  const unit = plan.unit ?? 1
  const frame = getRoomCeilingFrame(plan, input.roomId)
  const [offsetX, offsetZ] = input.offset ?? [0, 0]

  return {
    position: [
      frame.center[0] + offsetX * unit,
      frame.center[1] - (input.height ?? 0) * unit,
      frame.center[2] + offsetZ * unit,
    ],
    rotation: [0, input.rotationY ?? 0, 0],
  }
}

// 壁面基準の offset、高さ、inset から world 配置を計算する。
export function getWallPlacement(plan: BuildingPlan, input: WallPlacementInput): PlacementTransform {
  const unit = plan.unit ?? 1
  const frame = getRoomWallFrame(plan, input)
  const offset = (input.offset ?? 0) * unit
  const height = (input.height ?? 0) * unit
  const inset = (input.inset ?? 0) * unit

  return {
    position: [
      frame.center[0] + frame.tangent[0] * offset + frame.inwardNormal[0] * inset,
      height,
      frame.center[2] + frame.tangent[2] * offset + frame.inwardNormal[2] * inset,
    ],
    rotation: frame.rotation,
  }
}

function getRoomBounds(rooms: RoomSpec[]) {
  if (rooms.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
  }

  return rooms.reduce(
    (bounds, room) => {
      const [x, z] = room.position
      const [width, depth] = room.size

      return {
        minX: Math.min(bounds.minX, x - width / 2),
        maxX: Math.max(bounds.maxX, x + width / 2),
        minZ: Math.min(bounds.minZ, z - depth / 2),
        maxZ: Math.max(bounds.maxZ, z + depth / 2),
      }
    },
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  )
}

// plan 内から指定 ID の room を取得する。
function getRoom(plan: BuildingPlan, roomId: string): RoomSpec {
  const room = plan.rooms.find((candidate) => candidate.id === roomId)

  if (!room) {
    throw new Error(`Room "${roomId}" was not found in BuildingPlan.`)
  }

  return room
}

// plan.unit を考慮して room の位置とサイズを world units に変換する。
function scaleRoom(room: RoomSpec, unit: number): RoomSpec {
  if (unit === 1) {
    return room
  }

  return {
    ...room,
    position: scaleVec2(room.position, unit),
    size: scaleVec2(room.size, unit),
    wallThickness: scaleOptional(room.wallThickness, unit),
  }
}

function getEffectiveRoomWallThickness(plan: BuildingPlan, room: RoomSpec, unit: number): number {
  return room.wallThickness ?? plan.wallThickness * unit
}

function scaleOptional(value: number | undefined, unit: number): number | undefined {
  return value === undefined ? undefined : value * unit
}

// Vec2 を指定倍率でスケールする。
function scaleVec2(value: Vec2, unit: number): Vec2 {
  return [value[0] * unit, value[1] * unit]
}
