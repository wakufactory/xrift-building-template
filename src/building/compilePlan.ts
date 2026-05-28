import type { BoxPart, BoxPartColor, BuildingPlan, OpeningSpec, RoomSpec, SlabOpeningSpec, SurfaceSpec, Vec3, WallSide } from './types'

// 壁ローカル座標上の矩形セグメントを表す。
type WallSegment = {
  start: number
  end: number
  bottom: number
  top: number
}

type Rect2D = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// ドア・窓の省略値をまとめる。
const OPENING_DEFAULTS = {
  doorBottom: 0,
  doorHeight: 2.15,
  windowBottom: 1.05,
  windowHeight: 1.05,
}

// 浮動小数点の境界比較で使う許容誤差を表す。
const EPSILON = 0.001

// BuildingPlan を描画・物理用の BoxPart 配列へ変換する。
export function compileBuildingPlan(plan: BuildingPlan): BoxPart[] {
  const worldPlan = scalePlanToWorldUnits(plan)

  // 建物コンパイルの出力は、単一のフラットな BoxPart 配列に統一する。
  // 描画と物理の両方がこの中間表現を使うため、生成される建築要素は
  // すべて軸に沿った box として表現できる必要がある。
  return dedupeExactBoxParts([
    ...compileExteriorGround(worldPlan),
    ...worldPlan.rooms.flatMap((room) => compileRoom(worldPlan, room)),
    ...compileRoof(worldPlan),
  ])
}

// plan.unit を考慮して plan 全体を world units に正規化する。
function scalePlanToWorldUnits(plan: BuildingPlan): BuildingPlan {
  const unit = plan.unit ?? 1

  if (unit === 1) {
    return plan
  }

  return {
    ...plan,
    unit: 1,
    floorHeight: plan.floorHeight * unit,
    wallThickness: plan.wallThickness * unit,
    slabThickness: plan.slabThickness * unit,
    pillar: plan.pillar ? {
      ...plan.pillar,
      thickness: scaleOptional(plan.pillar.thickness, unit),
    } : undefined,
    roof: plan.roof === false ? false : plan.roof ? {
      ...plan.roof,
      overhang: scaleOptional(plan.roof.overhang, unit),
      thickness: scaleOptional(plan.roof.thickness, unit),
      heightOffset: scaleOptional(plan.roof.heightOffset, unit),
    } : undefined,
    exteriorGround: plan.exteriorGround === false ? false : plan.exteriorGround ? {
      ...plan.exteriorGround,
      margin: scaleOptional(plan.exteriorGround.margin, unit),
      thickness: scaleOptional(plan.exteriorGround.thickness, unit),
    } : undefined,
    rooms: plan.rooms.map((room) => ({
      ...room,
      position: scaleVec2(room.position, unit),
      size: scaleVec2(room.size, unit),
      wallThickness: scaleOptional(room.wallThickness, unit),
      doors: room.doors?.map((opening) => scaleOpening(opening, unit, true)),
      windows: room.windows?.map((opening) => scaleOpening(opening, unit, false)),
      floorOpenings: room.floorOpenings?.map((opening) => scaleSlabOpening(opening, unit)),
      ceilingOpenings: room.ceilingOpenings?.map((opening) => scaleSlabOpening(opening, unit)),
      roofOpenings: room.roofOpenings?.map((opening) => scaleSlabOpening(opening, unit)),
    })),
  }
}

// optional な数値を unit 倍する。
function scaleOptional(value: number | undefined, unit: number): number | undefined {
  return value === undefined ? undefined : value * unit
}

// Vec2 を unit 倍する。
function scaleVec2(value: [number, number], unit: number): [number, number] {
  return [value[0] * unit, value[1] * unit]
}

// 開口設定を unit 倍し、省略値も world units に正規化する。
function scaleOpening(opening: OpeningSpec, unit: number, isDoor: boolean): OpeningSpec {
  const defaultBottom = isDoor ? OPENING_DEFAULTS.doorBottom : OPENING_DEFAULTS.windowBottom
  const defaultHeight = isDoor ? OPENING_DEFAULTS.doorHeight : OPENING_DEFAULTS.windowHeight

  return {
    ...opening,
    offset: opening.offset * unit,
    width: opening.width * unit,
    bottom: (opening.bottom ?? defaultBottom) * unit,
    height: (opening.height ?? defaultHeight) * unit,
  }
}

// 床・天井 slab の開口設定を unit 倍する。
function scaleSlabOpening(opening: SlabOpeningSpec, unit: number): SlabOpeningSpec {
  return {
    ...opening,
    position: scaleVec2(opening.position, unit),
    size: scaleVec2(opening.size, unit),
  }
}

// 部屋群の外接矩形から外部地面の BoxPart を生成する。
function compileExteriorGround(plan: BuildingPlan): BoxPart[] {
  if (plan.exteriorGround === false || plan.rooms.length === 0) {
    return []
  }

  const ground = plan.exteriorGround ?? {}
  const margin = ground.margin ?? 14
  const thickness = ground.thickness ?? plan.slabThickness
  const bounds = getRoomBounds(plan.rooms)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const width = bounds.maxX - bounds.minX + margin * 2
  const depth = bounds.maxZ - bounds.minZ + margin * 2

  return [
    {
      id: 'exterior:ground',
      kind: 'exteriorGround',
      // 室内床と同じ高さに見せつつ、室内床と重なる部分で z-fighting
      // しないように、外部地面だけごくわずかに下げている。
      position: [centerX, plan.slabThickness - thickness / 2 - 0.002, centerZ],
      size: [width, thickness, depth],
      materialKey: ground.materialKey ?? plan.materialKeys.exteriorGround,
      collider: true,
    },
  ]
}

// 部屋群全体の XZ 境界を計算する。
function getRoomBounds(rooms: RoomSpec[]) {
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

// 部屋群の平面形状に沿って、非重複の平面屋根 BoxPart を生成する。
function compileRoof(plan: BuildingPlan): BoxPart[] {
  if (plan.roof === false || !plan.roof || plan.rooms.length === 0) {
    return []
  }

  const roof = plan.roof
  const overhang = roof.overhang ?? 0
  const thickness = roof.thickness ?? plan.slabThickness
  const heightOffset = roof.heightOffset ?? 0
  const y = plan.floorHeight + heightOffset
  const roofRects = plan.rooms.map((room) => {
    const [x, z] = room.position
    const [width, depth] = room.size
    return {
      minX: x - width / 2 - overhang,
      maxX: x + width / 2 + overhang,
      minZ: z - depth / 2 - overhang,
      maxZ: z + depth / 2 + overhang,
    }
  })
  const openingRects = plan.rooms.flatMap((room) => (
    room.roofOpenings?.map((opening) => slabOpeningToWorldRect(room, opening)) ?? []
  ))
  const rects = splitCoveredRects(roofRects, openingRects)

  return rects.map((rect, index) => (
    applySurfaceSpec({
      id: `roof:flat:${index}`,
      kind: 'roof',
      // 同じ高さで重なる roof box を作らないため、room 矩形の union を
      // 小さな非重複矩形に分けてから box 化する。
      position: [(rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2],
      size: [rect.maxX - rect.minX, thickness, rect.maxZ - rect.minZ],
      materialKey: roof.materialKey ?? plan.materialKeys.roof ?? plan.materialKeys.room.ceiling,
      color: roof.color,
      collider: true,
    }, roof)
  ))
}

// 入力矩形群の union から hole 矩形を引き、重ならない矩形群へ分割する。
function splitCoveredRects(rects: Rect2D[], holes: Rect2D[] = []): Rect2D[] {
  const clippedHoles = holes
    .flatMap((hole) => rects.map((rect) => intersectRects(rect, hole)))
    .filter((rect): rect is Rect2D => rect !== undefined)
  const xEdges = sortedUnique([
    ...rects.flatMap((rect) => [rect.minX, rect.maxX]),
    ...clippedHoles.flatMap((rect) => [rect.minX, rect.maxX]),
  ])
  const zEdges = sortedUnique([
    ...rects.flatMap((rect) => [rect.minZ, rect.maxZ]),
    ...clippedHoles.flatMap((rect) => [rect.minZ, rect.maxZ]),
  ])
  const coveredRows: Rect2D[] = []

  for (let zIndex = 0; zIndex < zEdges.length - 1; zIndex += 1) {
    const minZ = zEdges[zIndex]
    const maxZ = zEdges[zIndex + 1]
    let currentStartX: number | undefined

    for (let xIndex = 0; xIndex < xEdges.length - 1; xIndex += 1) {
      const minX = xEdges[xIndex]
      const maxX = xEdges[xIndex + 1]
      const covered = rects.some((rect) => rectCoversCell(rect, minX, maxX, minZ, maxZ))
      const removedByHole = clippedHoles.some((rect) => rectCoversCell(rect, minX, maxX, minZ, maxZ))
      const keep = covered && !removedByHole

      if (keep && currentStartX === undefined) {
        currentStartX = minX
      }

      if ((!keep || xIndex === xEdges.length - 2) && currentStartX !== undefined) {
        coveredRows.push({
          minX: currentStartX,
          maxX: keep ? maxX : minX,
          minZ,
          maxZ,
        })
        currentStartX = undefined
      }
    }
  }

  return mergeVerticalRects(coveredRows)
}

function rectCoversCell(rect: Rect2D, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  return rect.minX <= minX + EPSILON
    && rect.maxX >= maxX - EPSILON
    && rect.minZ <= minZ + EPSILON
    && rect.maxZ >= maxZ - EPSILON
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(4))))].sort((a, b) => a - b)
}

function mergeVerticalRects(rects: Rect2D[]): Rect2D[] {
  const merged: Rect2D[] = []

  for (const rect of rects) {
    const last = merged[merged.length - 1]
    if (
      last
      && nearlyEqual(last.minX, rect.minX)
      && nearlyEqual(last.maxX, rect.maxX)
      && nearlyEqual(last.maxZ, rect.minZ)
    ) {
      last.maxZ = rect.maxZ
    } else {
      merged.push({ ...rect })
    }
  }

  return merged
}

// 床・天井 slab を、開口を除いた非重複矩形 box 群として生成する。
function compileSlab(input: {
  room: RoomSpec
  kind: 'floor' | 'ceiling'
  y: number
  thickness: number
  materialKey: string
  color?: BoxPartColor
  surface?: SurfaceSpec
  openings: SlabOpeningSpec[]
}): BoxPart[] {
  const { room, kind, y, thickness, materialKey, color, surface, openings } = input
  const rects = splitRoomRectBySlabOpenings(room, openings)

  return rects.map((rect, index) => applySurfaceSpec({
    id: rects.length === 1 ? `${room.id}:${kind}` : `${room.id}:${kind}:${index}`,
    kind,
    position: [(rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2],
    size: [rect.maxX - rect.minX, thickness, rect.maxZ - rect.minZ],
    materialKey,
    color,
    collider: true,
  }, surface))
}

// 部屋矩形から床・天井開口を引き、残った slab 領域を非重複矩形に分割する。
function splitRoomRectBySlabOpenings(room: RoomSpec, openings: SlabOpeningSpec[]): Rect2D[] {
  const [roomX, roomZ] = room.position
  const [width, depth] = room.size
  const roomRect: Rect2D = {
    minX: roomX - width / 2,
    maxX: roomX + width / 2,
    minZ: roomZ - depth / 2,
    maxZ: roomZ + depth / 2,
  }
  const openingRects = openings
    .map((opening) => slabOpeningToWorldRect(room, opening))
    .map((rect) => intersectRects(roomRect, rect))
    .filter((rect): rect is Rect2D => rect !== undefined)

  if (openingRects.length === 0) {
    return [roomRect]
  }

  const xEdges = sortedUnique([
    roomRect.minX,
    roomRect.maxX,
    ...openingRects.flatMap((rect) => [rect.minX, rect.maxX]),
  ])
  const zEdges = sortedUnique([
    roomRect.minZ,
    roomRect.maxZ,
    ...openingRects.flatMap((rect) => [rect.minZ, rect.maxZ]),
  ])
  const rows: Rect2D[] = []

  for (let zIndex = 0; zIndex < zEdges.length - 1; zIndex += 1) {
    const minZ = zEdges[zIndex]
    const maxZ = zEdges[zIndex + 1]
    let currentStartX: number | undefined

    for (let xIndex = 0; xIndex < xEdges.length - 1; xIndex += 1) {
      const minX = xEdges[xIndex]
      const maxX = xEdges[xIndex + 1]
      const insideRoom = rectCoversCell(roomRect, minX, maxX, minZ, maxZ)
      const coveredByOpening = openingRects.some((rect) => rectCoversCell(rect, minX, maxX, minZ, maxZ))
      const keep = insideRoom && !coveredByOpening

      if (keep && currentStartX === undefined) {
        currentStartX = minX
      }

      if ((!keep || xIndex === xEdges.length - 2) && currentStartX !== undefined) {
        rows.push({
          minX: currentStartX,
          maxX: keep ? maxX : minX,
          minZ,
          maxZ,
        })
        currentStartX = undefined
      }
    }
  }

  return mergeVerticalRects(rows)
}

// 部屋中心基準の床・天井開口を world-space XZ 矩形へ変換する。
function slabOpeningToWorldRect(room: RoomSpec, opening: SlabOpeningSpec): Rect2D {
  const [roomX, roomZ] = room.position
  const [offsetX, offsetZ] = opening.position
  const [width, depth] = opening.size
  const centerX = roomX + offsetX
  const centerZ = roomZ + offsetZ

  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  }
}

// 2 つの XZ 矩形の交差を返す。
function intersectRects(a: Rect2D, b: Rect2D): Rect2D | undefined {
  const minX = Math.max(a.minX, b.minX)
  const maxX = Math.min(a.maxX, b.maxX)
  const minZ = Math.max(a.minZ, b.minZ)
  const maxZ = Math.min(a.maxZ, b.maxZ)

  if (maxX - minX <= EPSILON || maxZ - minZ <= EPSILON) {
    return undefined
  }

  return { minX, maxX, minZ, maxZ }
}

// 1 部屋から床、天井、壁、柱の BoxPart を生成する。
function compileRoom(plan: BuildingPlan, room: RoomSpec): BoxPart[] {
  const [x, z] = room.position
  const [width, depth] = room.size
  const wallThickness = room.wallThickness ?? plan.wallThickness
  const floorY = plan.slabThickness / 2
  const ceilingY = plan.floorHeight - plan.slabThickness / 2 - 0.001
  const floorSurface = room.surfaces?.floor
  const ceilingSurface = room.surfaces?.ceiling

  const parts: BoxPart[] = [
    ...compileSlab({
      room,
      kind: 'floor',
      y: floorY,
      thickness: plan.slabThickness,
      materialKey: floorSurface?.materialKey ?? plan.materialKeys.room.floor,
      color: floorSurface?.color,
      surface: floorSurface,
      openings: room.floorOpenings ?? [],
    }),
    ...compileSlab({
      room,
      kind: 'ceiling',
      y: ceilingY,
      thickness: plan.slabThickness,
      materialKey: ceilingSurface?.materialKey ?? plan.materialKeys.room.ceiling,
      color: ceilingSurface?.color,
      surface: ceilingSurface,
      openings: room.ceilingOpenings ?? [],
    }),
  ]

  for (const side of ['north', 'south', 'east', 'west'] as WallSide[]) {
    // ドアと窓は、壁ローカル座標上の矩形開口として扱う。壁生成では
    // まず一枚の壁からそれらの開口を引き、残った矩形を独立した
    // box セグメントとして出力する。
    const wallOpenings = [
      ...getSharedWallOpeningsOwnedByAnotherRoom(plan.rooms, room, side, plan.floorHeight),
      ...normalizeOpenings(room.doors ?? [], side, true),
      ...normalizeOpenings(room.windows ?? [], side, false),
    ]
    const wallSurface = {
      ...room.surfaces?.wall,
      ...room.surfaces?.walls?.[side],
    }

    parts.push(
      ...compileWall({
        roomId: room.id,
        side,
        roomCenter: [x, z],
        roomSize: [width, depth],
        wallThickness,
        bottomY: 0,
        height: plan.floorHeight,
        materialKey: wallSurface.materialKey ?? plan.materialKeys.room.wall,
        color: wallSurface.color,
        surface: wallSurface,
        openings: wallOpenings,
      }),
    )
  }

  parts.push(...compileRoomTrim(plan, room))
  return parts
}

// 他の部屋が所有する共有壁区間を、この部屋側の開口として返す。
function getSharedWallOpeningsOwnedByAnotherRoom(
  rooms: RoomSpec[],
  room: RoomSpec,
  side: WallSide,
  roomHeight: number,
): OpeningSpec[] {
  // 隣接する部屋は同じ境界面を共有することがある。同じ面に mesh と
  // collider が二重生成されないよう、辞書順で先の部屋が共有区間を
  // 所有する。ただし壁全体を skip すると、サイズ違いの部屋で非共有
  // 部分まで抜けるため、他の部屋が所有する重複区間だけを全高の開口
  // として差し引く。
  return rooms.flatMap((other) => {
    if (other.id === room.id) return []
    if (other.id > room.id) return []

    const overlap = getOppositeWallOverlap(room, side, other)
    if (!overlap) return []

    return [{
      side,
      offset: (overlap.start + overlap.end) / 2,
      width: overlap.end - overlap.start,
      bottom: 0,
      height: roomHeight,
    }]
  })
}

// 隣接する反対向きの壁同士が重なる区間を壁ローカル座標で返す。
function getOppositeWallOverlap(room: RoomSpec, side: WallSide, other: RoomSpec): { start: number, end: number } | undefined {
  const roomBounds = getRoomBoundary(room)
  const otherBounds = getRoomBoundary(other)
  const [roomX, roomZ] = room.position

  switch (side) {
    case 'north': {
      if (!nearlyEqual(roomBounds.minZ, otherBounds.maxZ)) return undefined
      const overlap = rangeIntersection(roomBounds.minX, roomBounds.maxX, otherBounds.minX, otherBounds.maxX)
      return overlap && { start: overlap.min - roomX, end: overlap.max - roomX }
    }
    case 'south': {
      if (!nearlyEqual(roomBounds.maxZ, otherBounds.minZ)) return undefined
      const overlap = rangeIntersection(roomBounds.minX, roomBounds.maxX, otherBounds.minX, otherBounds.maxX)
      return overlap && { start: overlap.min - roomX, end: overlap.max - roomX }
    }
    case 'east': {
      if (!nearlyEqual(roomBounds.maxX, otherBounds.minX)) return undefined
      const overlap = rangeIntersection(roomBounds.minZ, roomBounds.maxZ, otherBounds.minZ, otherBounds.maxZ)
      return overlap && zOverlapToNorthPositiveOffset(overlap.min, overlap.max, roomZ)
    }
    case 'west': {
      if (!nearlyEqual(roomBounds.minX, otherBounds.maxX)) return undefined
      const overlap = rangeIntersection(roomBounds.minZ, roomBounds.maxZ, otherBounds.minZ, otherBounds.maxZ)
      return overlap && zOverlapToNorthPositiveOffset(overlap.min, overlap.max, roomZ)
    }
  }
}

// Z 範囲の重なりを north 正方向の壁 offset 範囲に変換する。
function zOverlapToNorthPositiveOffset(minZ: number, maxZ: number, roomZ: number): { start: number, end: number } {
  return {
    start: roomZ - maxZ,
    end: roomZ - minZ,
  }
}

// 1 部屋の XZ 境界を計算する。
function getRoomBoundary(room: RoomSpec) {
  const [x, z] = room.position
  const [width, depth] = room.size

  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  }
}

// 2 つの一次元範囲の交差を計算する。
function rangeIntersection(aMin: number, aMax: number, bMin: number, bMax: number): { min: number, max: number } | undefined {
  const min = Math.max(aMin, bMin)
  const max = Math.min(aMax, bMax)

  if (max - min <= EPSILON) {
    return undefined
  }

  return { min, max }
}

// 2 つの数値が EPSILON 未満の差で等しいか判定する。
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

// 完全一致する BoxPart だけを重複除去する。
function dedupeExactBoxParts(parts: BoxPart[]): BoxPart[] {
  const seen = new Set<string>()

  return parts.filter((part) => {
    // これは幾何的なマージではない。隣接部屋から生成された角柱など、
    // 完全一致する box だけを消し、接しているだけ・一部重なるだけの
    // 建築要素はそのまま残す。
    const key = [
      part.kind,
      part.materialKey,
      part.color === undefined ? '' : colorToDedupeKey(part.color),
      part.visible === false ? 'hidden' : 'visible',
      part.collider === false ? 'noCollider' : 'collider',
      ...part.position.map(toDedupeKey),
      ...part.size.map(toDedupeKey),
      ...(part.rotation ?? [0, 0, 0]).map(toDedupeKey),
    ].join(':')

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// 重複判定用に数値を固定桁の文字列へ変換する。
function toDedupeKey(value: number): string {
  return value.toFixed(4)
}

// 重複判定用に色指定を文字列へ変換する。
function colorToDedupeKey(color: BoxPartColor): string {
  if (Array.isArray(color)) {
    return color.map(toDedupeKey).join(',')
  }

  return String(color)
}

// 指定 side の開口だけを取り出し、省略値を補う。
function normalizeOpenings(openings: OpeningSpec[], side: WallSide, isDoor: boolean): OpeningSpec[] {
  return openings
    .filter((opening) => opening.side === side)
    .map((opening) => ({
      ...opening,
      bottom: opening.bottom ?? (isDoor ? OPENING_DEFAULTS.doorBottom : OPENING_DEFAULTS.windowBottom),
      height: opening.height ?? (isDoor ? OPENING_DEFAULTS.doorHeight : OPENING_DEFAULTS.windowHeight),
    }))
}

// 1 面の壁を開口で分割し、BoxPart 群として生成する。
function compileWall(input: {
  roomId: string
  side: WallSide
  roomCenter: [number, number]
  roomSize: [number, number]
  wallThickness: number
  bottomY: number
  height: number
  materialKey: string
  color?: BoxPartColor
  surface?: SurfaceSpec
  openings: OpeningSpec[]
}): BoxPart[] {
  const { roomId, side, roomCenter, roomSize, wallThickness, bottomY, height, materialKey, color, surface, openings } = input
  const [roomX, roomZ] = roomCenter
  const [width, depth] = roomSize
  const wallLength = side === 'north' || side === 'south' ? width : depth
  const segments = splitWallSegments(wallLength, height, openings)

  // 壁の分割は、まず壁ローカルの 2D 空間で解く。開口を引き終わって
  // から world-space の position と box size に戻すことで、分割処理を
  // 壁の向きから独立させている。
  return segments.map((segment, index) => {
    const centerAlongWall = (segment.start + segment.end) / 2
    const segmentLength = segment.end - segment.start
    const centerY = bottomY + (segment.bottom + segment.top) / 2
    const segmentHeight = segment.top - segment.bottom

    return applySurfaceSpec({
      id: `${roomId}:wall:${side}:${index}`,
      kind: 'wall',
      position: wallPartPosition(side, roomX, roomZ, width, depth, centerAlongWall, centerY),
      size: wallPartSize(side, segmentLength, segmentHeight, wallThickness),
      materialKey,
      color,
      collider: true,
    }, surface)
  })
}

// SurfaceSpec の hidden / noCollider を BoxPart に反映する。
function applySurfaceSpec(part: BoxPart, surface: SurfaceSpec | undefined): BoxPart {
  if (!surface) {
    return part
  }

  return {
    ...part,
    visible: surface.hidden ? false : part.visible,
    collider: surface.noCollider ? false : part.collider,
  }
}

// 壁全体の矩形から開口を引き、残った壁セグメントを返す。
function splitWallSegments(wallLength: number, floorHeight: number, openings: OpeningSpec[]): WallSegment[] {
  // 最初は壁全面を表す 1 枚の矩形から始める。各開口は現在のセグメント
  // 集合から矩形の穴をくり抜き、残った矩形が box instance になる。
  let segments: WallSegment[] = [
    {
      start: -wallLength / 2,
      end: wallLength / 2,
      bottom: 0,
      top: floorHeight,
    },
  ]

  for (const opening of openings) {
    const openingStart = opening.offset - opening.width / 2
    const openingEnd = opening.offset + opening.width / 2
    const openingBottom = opening.bottom ?? 0
    const openingTop = openingBottom + (opening.height ?? OPENING_DEFAULTS.doorHeight)

    segments = segments.flatMap((segment) => subtractOpening(segment, {
      start: openingStart,
      end: openingEnd,
      bottom: openingBottom,
      top: openingTop,
    }))
  }

  return segments.filter((segment) => segment.end - segment.start > EPSILON && segment.top - segment.bottom > EPSILON)
}

// 1 つの壁セグメントから 1 つの開口矩形を差し引く。
function subtractOpening(segment: WallSegment, opening: WallSegment): WallSegment[] {
  const overlapStart = Math.max(segment.start, opening.start)
  const overlapEnd = Math.min(segment.end, opening.end)
  const overlapBottom = Math.max(segment.bottom, opening.bottom)
  const overlapTop = Math.min(segment.top, opening.top)

  if (overlapStart >= overlapEnd || overlapBottom >= overlapTop) {
    return [segment]
  }

  const pieces: WallSegment[] = []

  // 1 つの矩形開口を引くと、最大で 4 つの独立した壁矩形が残る。
  // 開口の左、右、下、上の各部分。
  if (segment.start < overlapStart) {
    pieces.push({ ...segment, end: overlapStart })
  }
  if (overlapEnd < segment.end) {
    pieces.push({ ...segment, start: overlapEnd })
  }
  if (segment.bottom < overlapBottom) {
    pieces.push({
      start: overlapStart,
      end: overlapEnd,
      bottom: segment.bottom,
      top: overlapBottom,
    })
  }
  if (overlapTop < segment.top) {
    pieces.push({
      start: overlapStart,
      end: overlapEnd,
      bottom: overlapTop,
      top: segment.top,
    })
  }

  return pieces
}

// 壁ローカルのセグメント中心を world-space の box 中心へ変換する。
function wallPartPosition(
  side: WallSide,
  roomX: number,
  roomZ: number,
  width: number,
  depth: number,
  centerAlongWall: number,
  centerY: number,
): Vec3 {
  // このワールドではデフォルト正面の -Z を north として扱う。
  // east/west 壁上の offset も + を north 方向に揃える。
  switch (side) {
    case 'north':
      return [roomX + centerAlongWall, centerY, roomZ - depth / 2]
    case 'south':
      return [roomX + centerAlongWall, centerY, roomZ + depth / 2]
    case 'east':
      return [roomX + width / 2, centerY, roomZ - centerAlongWall]
    case 'west':
      return [roomX - width / 2, centerY, roomZ - centerAlongWall]
  }
}

// 壁の向きに応じて box size を X/Z 軸へ割り当てる。
function wallPartSize(side: WallSide, length: number, height: number, wallThickness: number): Vec3 {
  // 壁はすべて回転なしの box として生成する。向きは、長辺を X に置くか
  // Z に置くかで表現する。
  if (side === 'north' || side === 'south') {
    return [length, height, wallThickness]
  }

  return [wallThickness, height, length]
}

// 部屋の四隅に柱 BoxPart を生成する。
function compileRoomTrim(plan: BuildingPlan, room: RoomSpec): BoxPart[] {
  const [x, z] = room.position
  const [width, depth] = room.size
  const wallThickness = room.wallThickness ?? plan.wallThickness
  const pillarSize = plan.pillar?.thickness ?? wallThickness * 1.4
  const pillarHeight = plan.floorHeight + 0.001
  const y = pillarHeight / 2

  // 角柱は装飾であり、衝突境界を分かりやすくする役割も持つ。隣接部屋
  // から同じ角柱が生成された場合は、最後の dedupe で除去される。
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ].map(([dx, dz], index) => ({
    id: `${room.id}:pillar:${index}`,
    kind: 'pillar',
    position: [x + dx, y, z + dz],
    size: [pillarSize, pillarHeight, pillarSize],
    materialKey: plan.materialKeys.pillar,
    collider: true,
  }))
}
