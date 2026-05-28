import { useId, useMemo, type ReactNode } from 'react'
import { Building } from './Building'
import { BuildingPlacementProvider } from './RoomObject'
import type { BuildingMaterialCatalog } from './materials'
import type { BoxInstanceSource, BuildingPlan, Vec3 } from './types'

// BuildingWorld の配置、識別子、plan、material を表す。
export type BuildingWorldProps = {
  id?: string
  name?: string
  plan: BuildingPlan
  materials: BuildingMaterialCatalog
  position?: Vec3
  scale?: number
  source?: BoxInstanceSource
  enableProfileLog?: boolean
  children?: ReactNode
}

// Building を配置 group で包み、source 情報を付けて描画する。
export function BuildingWorld({
  id,
  name,
  plan,
  materials,
  position = [0, 0, 0],
  scale = 1,
  source,
  enableProfileLog = true,
  children,
}: BuildingWorldProps) {
  const autoSourceId = useId()
  const buildingSource = useMemo<BoxInstanceSource>(
    () => source ?? { kind: 'buildingWorld', id: id ?? autoSourceId, label: name },
    [autoSourceId, id, name, source],
  )

  return (
    <group position={position} scale={scale} name={name ?? id} userData={{ boxSource: buildingSource }}>
      <BuildingPlacementProvider plan={plan}>
        <Building
          plan={plan}
          materials={materials}
          source={buildingSource}
          enableProfileLog={enableProfileLog}
        />
        {children}
      </BuildingPlacementProvider>
    </group>
  )
}
