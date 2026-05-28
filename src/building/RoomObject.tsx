import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { getBuildingInfo, getCeilingPlacement, getFloorPlacement, getRoomInfo, getWallPlacement } from './placement'
import type { BuildingPlan, Vec2, WallSide } from './types'

type BuildingPlacementContextValue = {
  plan: BuildingPlan
}

export type RoomObjectContextValue = {
  roomId: string
}

export type WallObjectContextValue = RoomObjectContextValue & {
  side: WallSide
}

const BuildingPlacementContext = createContext<BuildingPlacementContextValue | null>(null)
const RoomObjectContext = createContext<RoomObjectContextValue | undefined>(undefined)
const WallObjectContext = createContext<WallObjectContextValue | undefined>(undefined)

export type BuildingPlacementProviderProps = {
  plan: BuildingPlan
  children?: ReactNode
}

export function BuildingPlacementProvider({ plan, children }: BuildingPlacementProviderProps) {
  const value = useMemo(() => ({ plan }), [plan])

  return (
    <BuildingPlacementContext.Provider value={value}>
      {children}
    </BuildingPlacementContext.Provider>
  )
}

export type RoomObjectProps = {
  roomId: string
  position?: Vec2
  height?: number
  rotationY?: number
  children?: ReactNode
}

export function RoomObject({
  roomId,
  position,
  height,
  rotationY,
  children,
}: RoomObjectProps) {
  const objectContext = useMemo<RoomObjectContextValue>(() => ({ roomId }), [roomId])
  const transform = useFloorPlacement({
    roomId,
    position,
    height,
    rotationY,
  })

  return (
    <RoomObjectContext.Provider value={objectContext}>
      <group position={transform.position} rotation={transform.rotation}>
        {children}
      </group>
    </RoomObjectContext.Provider>
  )
}

export type CeilingObjectProps = RoomObjectProps

export function CeilingObject({
  roomId,
  position,
  height,
  rotationY,
  children,
}: CeilingObjectProps) {
  const objectContext = useMemo<RoomObjectContextValue>(() => ({ roomId }), [roomId])
  const transform = useCeilingPlacement({
    roomId,
    position,
    height,
    rotationY,
  })

  return (
    <RoomObjectContext.Provider value={objectContext}>
      <group position={transform.position} rotation={transform.rotation}>
        {children}
      </group>
    </RoomObjectContext.Provider>
  )
}

export type UseFloorPlacementInput = {
  roomId: string
  position?: Vec2
  height?: number
  rotationY?: number
}

export function useFloorPlacement({
  roomId,
  position,
  height,
  rotationY,
}: UseFloorPlacementInput) {
  const { plan } = useBuildingPlacement()

  return useMemo(
    () => getFloorPlacement(plan, {
      roomId,
      offset: position,
      height,
      rotationY,
    }),
    [height, plan, position, roomId, rotationY],
  )
}

export type UseCeilingPlacementInput = UseFloorPlacementInput

export function useCeilingPlacement({
  roomId,
  position,
  height,
  rotationY,
}: UseCeilingPlacementInput) {
  const { plan } = useBuildingPlacement()

  return useMemo(
    () => getCeilingPlacement(plan, {
      roomId,
      offset: position,
      height,
      rotationY,
    }),
    [height, plan, position, roomId, rotationY],
  )
}

export type WallObjectProps = {
  roomId: string
  side: WallSide
  offset?: number
  position?: number
  height?: number
  inset?: number
  children?: ReactNode
}

export function WallObject({
  roomId,
  side,
  offset,
  position,
  height,
  inset,
  children,
}: WallObjectProps) {
  const roomContext = useMemo<RoomObjectContextValue>(() => ({ roomId }), [roomId])
  const wallContext = useMemo<WallObjectContextValue>(() => ({ roomId, side }), [roomId, side])
  const transform = useWallPlacement({
    roomId,
    side,
    offset: offset ?? position,
    height,
    inset,
  })

  return (
    <RoomObjectContext.Provider value={roomContext}>
      <WallObjectContext.Provider value={wallContext}>
        <group position={transform.position} rotation={transform.rotation}>
          {children}
        </group>
      </WallObjectContext.Provider>
    </RoomObjectContext.Provider>
  )
}

export type UseWallPlacementInput = {
  roomId: string
  side: WallSide
  offset?: number
  position?: number
  height?: number
  inset?: number
}

export function useWallPlacement({
  roomId,
  side,
  offset,
  position,
  height,
  inset,
}: UseWallPlacementInput) {
  const { plan } = useBuildingPlacement()

  return useMemo(
    () => getWallPlacement(plan, {
      roomId,
      side,
      offset: offset ?? position,
      height,
      inset,
    }),
    [height, inset, offset, plan, position, roomId, side],
  )
}

export function useBuildingInfo() {
  const { plan } = useBuildingPlacement()

  return useMemo(() => getBuildingInfo(plan), [plan])
}

export function useRoomInfo(roomId: string) {
  const { plan } = useBuildingPlacement()

  return useMemo(() => getRoomInfo(plan, roomId), [plan, roomId])
}

export function useRoomObjectContext() {
  return useContext(RoomObjectContext)
}

export function useWallObjectContext() {
  return useContext(WallObjectContext)
}

function useBuildingPlacement(): BuildingPlacementContextValue {
  const context = useContext(BuildingPlacementContext)

  if (!context) {
    throw new Error('RoomObject, CeilingObject, and WallObject must be rendered inside BuildingWorld.')
  }

  return context
}
