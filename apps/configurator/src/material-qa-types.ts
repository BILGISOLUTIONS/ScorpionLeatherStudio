export type MaterialQaMapKey = 'baseColor' | 'roughness' | 'normal'
export type MaterialQaShape = 'sphere' | 'flat' | 'cylinder'
export type MaterialQaLightingPreset = 'studio' | 'raking-left' | 'raking-right' | 'top'

export interface MaterialQaMapAsset {
  file: File
  url: string
  width: number
  height: number
}
