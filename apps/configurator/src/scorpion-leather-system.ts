import {
  composeLeatherMaterialVariant,
  type LeatherCompositionResult,
  type LeatherCompositionSelection,
  type LeatherDyeDefinition,
  type LeatherFinishDefinition,
  type LeatherStructureDefinition,
} from '@sls/material-library'
import {
  preferredMaterialTextureEdge,
  scorpionMaterialDefinitions,
} from './scorpion-materials'

export type ScorpionLeatherLabSelection = LeatherCompositionSelection

const materialRecord = Object.fromEntries(
  scorpionMaterialDefinitions.map((material) => [material.id, material] as const),
)

export const scorpionLeatherStructures: readonly LeatherStructureDefinition[] = [
  {
    id: 'catalog-dark-textured',
    label: 'Dark textured reference',
    materialId: 'SCL-DTY',
    compositionPolicy: 'locked',
    availability: 'captured',
    description: 'Photographed catalog color/finish reference. Dye is intentionally locked.',
  },
  {
    id: 'catalog-cognac-textured',
    label: 'Cognac textured reference',
    materialId: 'SCL-COGNAC',
    compositionPolicy: 'locked',
    availability: 'captured',
    description: 'Photographed catalog color/finish reference. Dye is intentionally locked.',
  },
  {
    id: 'catalog-tan-smooth',
    label: 'Tan smooth reference',
    materialId: 'SCL-TAN-SMOOTH',
    compositionPolicy: 'locked',
    availability: 'captured',
    description: 'Photographed catalog color/finish reference. Dye is intentionally locked.',
  },
  {
    id: 'catalog-tan-textured',
    label: 'Tan textured reference',
    materialId: 'SCL-TAN-TEXTURED',
    compositionPolicy: 'locked',
    availability: 'captured',
    description: 'Photographed catalog color/finish reference. Dye is intentionally locked.',
  },
  {
    id: 'neutral-leather-study',
    label: 'Neutral leather study',
    materialId: 'SCL-NEUTRAL-DEV',
    compositionPolicy: 'tintable',
    availability: 'development',
    description: 'Development-only neutral base for testing dye/finish composition until a calibrated neutral capture is available.',
  },
]

export const scorpionLeatherDyes: readonly LeatherDyeDefinition[] = [
  {
    id: 'captured',
    label: 'As photographed',
    mode: 'captured',
    color: '#ffffff',
    tintStrength: 0,
    availability: 'captured',
  },
  {
    id: 'black',
    label: 'Black',
    mode: 'tint',
    color: '#171513',
    tintStrength: 0.96,
    roughnessMultiplier: 1.02,
    availability: 'development',
  },
  {
    id: 'cognac',
    label: 'Cognac',
    mode: 'tint',
    color: '#9e5b32',
    tintStrength: 0.92,
    roughnessMultiplier: 1,
    availability: 'development',
  },
  {
    id: 'oxblood',
    label: 'Oxblood',
    mode: 'tint',
    color: '#4a0e17',
    tintStrength: 0.94,
    roughnessMultiplier: 1.04,
    availability: 'development',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    mode: 'tint',
    color: '#0b4632',
    tintStrength: 0.92,
    roughnessMultiplier: 0.98,
    availability: 'development',
  },
  {
    id: 'navy',
    label: 'Midnight navy',
    mode: 'tint',
    color: '#14283d',
    tintStrength: 0.94,
    roughnessMultiplier: 1,
    availability: 'development',
  },
]

export const scorpionLeatherFinishes: readonly LeatherFinishDefinition[] = [
  {
    id: 'captured',
    label: 'As photographed',
    mode: 'captured',
    roughnessMultiplier: 1,
    sheenMultiplier: 1,
    availability: 'captured',
  },
  {
    id: 'matte',
    label: 'Matte',
    mode: 'finish',
    roughnessMultiplier: 1.16,
    sheenMultiplier: 0.72,
    clearcoatAdd: 0,
    normalScaleMultiplier: 1.02,
    availability: 'development',
  },
  {
    id: 'satin',
    label: 'Satin',
    mode: 'finish',
    roughnessMultiplier: 0.84,
    sheenMultiplier: 1.18,
    clearcoatAdd: 0.035,
    clearcoatRoughness: 0.5,
    normalScaleMultiplier: 0.98,
    availability: 'development',
  },
  {
    id: 'polished',
    label: 'Polished',
    mode: 'finish',
    roughnessMultiplier: 0.64,
    sheenMultiplier: 1.32,
    clearcoatAdd: 0.08,
    clearcoatRoughness: 0.3,
    normalScaleMultiplier: 0.94,
    availability: 'development',
  },
]

const structureById = new Map(scorpionLeatherStructures.map((entry) => [entry.id, entry]))
const dyeById = new Map(scorpionLeatherDyes.map((entry) => [entry.id, entry]))
const finishById = new Map(scorpionLeatherFinishes.map((entry) => [entry.id, entry]))

const referenceStructureMap: Readonly<Record<string, string>> = {
  'hood-dark-yellow': 'catalog-dark-textured',
  'hood-cognac': 'catalog-cognac-textured',
  'hood-tan-smooth': 'catalog-tan-smooth',
  'hood-tan-textured': 'catalog-tan-textured',
}

export function photographedStructureForReference(referenceId: string): string {
  return referenceStructureMap[referenceId] ?? 'catalog-cognac-textured'
}

export function defaultLeatherLabSelection(referenceId: string): ScorpionLeatherLabSelection {
  return {
    structureId: photographedStructureForReference(referenceId),
    dyeId: 'captured',
    finishId: 'captured',
  }
}

export function composeScorpionLeather(
  selection: ScorpionLeatherLabSelection,
): LeatherCompositionResult {
  const structure = structureById.get(selection.structureId)
  const dye = dyeById.get(selection.dyeId)
  const finish = finishById.get(selection.finishId)
  if (!structure || !dye || !finish) throw new Error('Invalid Scorpion leather material recipe.')

  return composeLeatherMaterialVariant({
    structure,
    dye,
    finish,
    materials: materialRecord,
    preferredMaxEdge: preferredMaterialTextureEdge(),
  })
}
