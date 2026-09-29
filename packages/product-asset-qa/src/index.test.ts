import { describe, expect, it } from 'vitest'
import type { AssetManifest } from '@sls/product-schema'
import type { ProductConstructionPacket } from '@sls/product-capture'
import {
  buildProductAssetQaApproval,
  defaultProductAssetQaPolicy,
  evaluateProductAssetQa,
  productAssetReviewLabels,
  promoteProductAsset,
  type ProductAssetHumanReview,
  type ProductAssetInspection,
} from './index'

const construction: ProductConstructionPacket = {
  schemaVersion: 1,
  productId: 'SC-WH-001',
  productLabel: 'Scorpion Leather Welding Hood',
  productCategory: 'Leather Welding Hood',
  sourceCaptureSessionId: 'SC-PROD-20260924-0001',
  capturePlanId: 'scorpion-welding-hood-v1',
  generatedAt: '2026-09-24T06:00:00.000Z',
  status: 'ready-for-digital-twin-reconstruction',
  automaticAssetMutation: false,
  provenance: { operator: 'Capture Operator', capturedAt: '2026-09-24T05:00:00.000Z' },
  referenceCoverage: [],
  dimensionsMm: { maxWidth: 360, maxHeight: 670, maxDepth: 325 },
  constructionNodes: [
    { role: 'product-root', label: 'Product root', nodeName: 'SLS_ProductRoot', status: 'confirmed' },
    { role: 'shell-main', label: 'Main shell', nodeName: 'Shell_Main', status: 'confirmed' },
    { role: 'visor-pivot', label: 'Visor pivot', nodeName: 'Visor_Pivot', status: 'confirmed' },
    { role: 'visor-frame', label: 'Visor frame', nodeName: 'Visor_Frame', status: 'confirmed' },
    { role: 'visor-lens', label: 'Visor lens', nodeName: 'Visor_Lens', status: 'confirmed' },
  ],
  components: [],
  materialSlots: [],
}

const manifest: AssetManifest = {
  schemaVersion: 1,
  assetId: 'sc-wh-001-v1',
  model: 'sc-wh-001-v1.glb',
  units: 'meters',
  upAxis: 'Y',
  frontAxis: '-Z',
  rootNode: 'SLS_ProductRoot',
  materialSlots: {
    LeatherPrimary: ['Shell_Main'],
    HardwarePrimary: ['Visor_Frame'],
    Lens: ['Visor_Lens'],
  },
  materialSlotProfiles: {
    LeatherPrimary: { kind: 'leather', mapping: 'uv0', requiresUv0: true, requiresNormals: true, tangents: 'recommended', metersPerUvUnit: 1, uvScaleToleranceRatio: 0.2 },
    HardwarePrimary: { kind: 'metal', mapping: 'uv0', requiresUv0: true, requiresNormals: true, tangents: 'optional', metersPerUvUnit: 1, uvScaleToleranceRatio: 0.25 },
    Lens: { kind: 'glass', mapping: 'uv0', requiresUv0: false, requiresNormals: true, tangents: 'optional' },
  },
  defaultMaterialVariants: {
    LeatherPrimary: 'SCL-001',
    HardwarePrimary: 'SCH-001',
    Lens: 'SGL-001',
  },
  customizationZones: {
    front: {
      label: 'Front tooling area',
      node: 'Shell_Main',
      purposes: ['tooling', 'text'],
      origin: [0, 0.05, 0.16],
      normal: [0, 0, 1],
      up: [0, 1, 0],
      sizeMeters: [0.2, 0.18],
      safeInsetMeters: 0.01,
    },
  },
  components: {},
  animations: {
    'visor.open': {
      target: 'Visor_Pivot',
      property: 'rotation.x',
      from: 0,
      to: -1.7,
      durationMs: 420,
      easing: 'easeInOutCubic',
    },
  },
  cameraPresets: {
    hero: { target: [0, 0.04, 0], position: [0.48, 0.28, 0.68], fov: 35 },
  },
}

const inspection: ProductAssetInspection = {
  schemaVersion: 1,
  assetId: manifest.assetId,
  inspectedAt: '2026-09-24T07:00:00.000Z',
  modelFile: { name: 'sc-wh-001-v1.glb', sizeBytes: 4_000_000, type: 'model/gltf-binary' },
  boundsMeters: { width: 0.36, height: 0.67, depth: 0.325 },
  rootScale: [1, 1, 1],
  nodeNames: ['SLS_ProductRoot', 'Shell_Main', 'Visor_Pivot', 'Visor_Frame', 'Visor_Lens'],
  duplicateNodeNames: [],
  meshCount: 12,
  triangleCount: 84_000,
  materialCount: 5,
  textureCount: 12,
  maxTextureEdge: 2048,
  unnamedMeshCount: 0,
  nonUniformScaleNodes: [],
  negativeScaleNodes: [],
  animationClipNames: [],
  meshDiagnostics: [
    { nodeName: 'Shell_Main', triangleCount: 60_000, materialCount: 1, hasUv0: true, hasUv1: false, hasNormals: true, hasTangents: true, estimatedMetersPerUvUnit: 1, uvScaleVariationRatio: 1.08, uv0Bounds: { min: [0, 0], max: [1, 1] } },
    { nodeName: 'Visor_Frame', triangleCount: 12_000, materialCount: 1, hasUv0: true, hasUv1: false, hasNormals: true, hasTangents: false, estimatedMetersPerUvUnit: 1, uvScaleVariationRatio: 1.12, uv0Bounds: { min: [0, 0], max: [1, 1] } },
    { nodeName: 'Visor_Lens', triangleCount: 12_000, materialCount: 1, hasUv0: false, hasUv1: false, hasNormals: true, hasTangents: false },
  ],
}

const lifecycles = {
  'SCL-001': 'production-approved',
  'SCH-001': 'production-approved',
  'SGL-001': 'production-approved',
} as const

function review(): ProductAssetHumanReview {
  return {
    reviewer: 'Asset Reviewer',
    reviewedAt: '2026-09-24T08:00:00.000Z',
    checks: Object.fromEntries(Object.keys(productAssetReviewLabels).map((key) => [key, true])) as ProductAssetHumanReview['checks'],
    notes: 'Physical product, motion and mobile rendering reviewed.',
  }
}

describe('product asset QA', () => {
  it('accepts an in-budget asset that matches the physical construction packet', () => {
    expect(evaluateProductAssetQa({
      construction,
      manifest,
      inspection,
      materialLifecycleById: lifecycles,
    }).filter((entry) => entry.severity === 'error')).toEqual([])
  })

  it('blocks scale drift, missing semantic nodes and non-production materials', () => {
    const badInspection: ProductAssetInspection = {
      ...inspection,
      boundsMeters: { ...inspection.boundsMeters, width: 0.6 },
      nodeNames: inspection.nodeNames.filter((name) => name !== 'Visor_Pivot'),
    }

    const issues = evaluateProductAssetQa({
      construction,
      manifest,
      inspection: badInspection,
      materialLifecycleById: { ...lifecycles, 'SCL-001': 'reference-only' },
    })

    expect(issues.some((entry) => entry.path === 'inspection.boundsMeters.width' && entry.severity === 'error')).toBe(true)
    expect(issues.some((entry) => entry.message.includes('Visor_Pivot'))).toBe(true)
    expect(issues.some((entry) => entry.message.includes('reference-only'))).toBe(true)
  })

  it('blocks a texture-swappable surface that is missing UV0', () => {
    const issues = evaluateProductAssetQa({
      construction,
      manifest,
      inspection: {
        ...inspection,
        meshDiagnostics: inspection.meshDiagnostics.map((mesh) => (
          mesh.nodeName === 'Shell_Main' ? { ...mesh, hasUv0: false } : mesh
        )),
      },
      materialLifecycleById: lifecycles,
    })
    expect(issues.some((entry) => entry.path.endsWith('Shell_Main.uv0') && entry.severity === 'error')).toBe(true)
  })

  it('blocks material surfaces whose UV scale does not match the physical authoring contract', () => {
    const issues = evaluateProductAssetQa({
      construction,
      manifest,
      inspection: {
        ...inspection,
        meshDiagnostics: inspection.meshDiagnostics.map((mesh) => (
          mesh.nodeName === 'Shell_Main'
            ? { ...mesh, estimatedMetersPerUvUnit: 0.35 }
            : mesh
        )),
      },
      materialLifecycleById: lifecycles,
    })
    expect(issues.some((entry) => entry.path.endsWith('Shell_Main.estimatedMetersPerUvUnit') && entry.severity === 'error')).toBe(true)
  })

  it('blocks placement zones that no longer point at a renderable mesh', () => {
    const issues = evaluateProductAssetQa({
      construction,
      manifest: {
        ...manifest,
        customizationZones: {
          front: { ...manifest.customizationZones!.front, node: 'Visor_Pivot' },
        },
      },
      inspection,
      materialLifecycleById: lifecycles,
    })
    expect(issues.some((entry) => entry.path === 'manifest.customizationZones.front.node')).toBe(true)
  })

  it('enforces production budgets', () => {
    const issues = evaluateProductAssetQa({
      construction,
      manifest,
      inspection: {
        ...inspection,
        modelFile: { ...inspection.modelFile, sizeBytes: defaultProductAssetQaPolicy.maxModelBytes + 1 },
        triangleCount: defaultProductAssetQaPolicy.maxTriangles + 1,
        maxTextureEdge: 4096,
      },
      materialLifecycleById: lifecycles,
    })
    expect(issues.filter((entry) => entry.severity === 'error').length).toBeGreaterThanOrEqual(3)
  })

  it('requires every human QA check before approval', () => {
    const incomplete = review()
    incomplete.checks.mobilePerformance = false

    expect(() => buildProductAssetQaApproval({
      construction,
      manifest,
      inspection,
      review: incomplete,
      materialLifecycleById: lifecycles,
    })).toThrow(/Every visual\/functional QA check/)
  })

  it('creates an explicit approval packet and deterministic production placement', () => {
    const approval = buildProductAssetQaApproval({
      construction,
      manifest,
      inspection,
      review: review(),
      materialLifecycleById: lifecycles,
    })

    expect(approval).toMatchObject({
      decision: 'approved-for-production-asset-promotion',
      automaticRegistryMutation: false,
      productId: 'SC-WH-001',
      assetId: 'sc-wh-001-v1',
    })

    const promoted = promoteProductAsset({
      construction,
      manifest,
      inspection,
      approval,
      promotedAt: '2026-09-24T09:00:00.000Z',
    })

    expect(promoted.record.lifecycle).toBe('production-approved')
    expect(promoted.record.automaticRegistryMutation).toBe(false)
    expect(promoted.record.manifest.model).toBe('/assets/products/SC-WH-001/sc-wh-001-v1/model.glb')
    expect(promoted.assetPlacement.files).toHaveLength(4)
  })
})
