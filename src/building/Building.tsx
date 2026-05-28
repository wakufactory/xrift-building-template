import { useEffect, useMemo } from 'react'
import { compileBuildingPlan } from './compilePlan'
import { BoxLayer } from './InstancedBoxLayer'
import type { BuildingMaterialCatalog } from './materials'
import type { BoxInstanceSource, BoxPart, BuildingPlan } from './types'

// Building コンポーネントへ渡す plan、material、ログ設定を表す。
export type BuildingProps = {
  plan: BuildingPlan
  materials: BuildingMaterialCatalog
  source?: BoxInstanceSource
  enableProfileLog?: boolean
}

// BuildingPlan を BoxPart にコンパイルし、描画と collider に分配する。
export function Building({ plan, materials, source, enableProfileLog = true }: BuildingProps) {
  const parts = useMemo(() => compileBuildingPlan(plan), [plan])
  const sourcedParts = useMemo(() => {
    if (!source) return parts
    return parts.map((part) => ({
      ...part,
      source: part.source ?? source,
    }))
  }, [parts, source])

  useEffect(() => {
    if (!enableProfileLog) return
    console.log('[building profile]', source, createBuildingProfile(parts))
  }, [enableProfileLog, parts, source])

  return (
    <>
      <BoxLayer parts={sourcedParts} materials={materials} collider />
    </>
  )
}

// コンパイル済み box 群の描画数・collider 数・分類数を集計する。
function createBuildingProfile(parts: BoxPart[]) {
  const byMaterial = countBy(parts, (part) => part.materialKey)
  const byKind = countBy(parts, (part) => part.kind)
  const renderInstances = parts.filter((part) => part.visible !== false).length
  const colliderInstances = parts.filter((part) => part.collider !== false).length

  return {
    renderInstances,
    colliderInstances,
    materialCount: byMaterial.size,
    kindCount: byKind.size,
    byMaterial: Object.fromEntries(byMaterial),
    byKind: Object.fromEntries(byKind),
  }
}

// 指定した key で BoxPart 配列を集計する。
function countBy(parts: BoxPart[], getKey: (part: BoxPart) => string) {
  const counts = new Map<string, number>()

  for (const part of parts) {
    const key = getKey(part)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}
