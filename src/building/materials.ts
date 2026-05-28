import type { MeshStandardMaterialParameters } from 'three'

// box texture の wrapping 方法を表す。
export type BoxTextureWrap = 'repeat' | 'clamp' | 'mirror'

// material catalog から読み込む texture 設定を表す。
export type BoxTextureSpec = {
  map: string
  tileSize?: number | [number, number]
  repeat?: [number, number]
  offset?: [number, number]
  rotation?: number
  wrap?: BoxTextureWrap
}

// box 描画で使う MeshStandardMaterial 相当の設定を表す。
export type BoxMaterialParameters = Omit<MeshStandardMaterialParameters, 'map'> & {
  texture?: BoxTextureSpec
}

// material key から box material 設定への対応表を表す。
export type BoxMaterialCatalog = Record<string, BoxMaterialParameters>

// material key が見つからない時に使う fallback material を表す。
export const missingBoxMaterial: BoxMaterialParameters = {
  color: '#ff4fb8',
  roughness: 0.8,
  metalness: 0,
}

// 既存の building API と互換にするための texture spec alias。
export type BuildingTextureSpec = BoxTextureSpec

// 既存の building API と互換にするための texture wrap alias。
export type BuildingTextureWrap = BoxTextureWrap

// 既存の building API と互換にするための material parameter alias。
export type BuildingMaterialParameters = BoxMaterialParameters

// 既存の building API と互換にするための material catalog alias。
export type BuildingMaterialCatalog = BoxMaterialCatalog

// 既存の building API と互換にするための fallback material alias。
export const missingBuildingMaterial = missingBoxMaterial
