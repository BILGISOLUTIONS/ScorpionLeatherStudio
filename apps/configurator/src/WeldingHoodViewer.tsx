import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createInitialConfiguration, setSelection } from '@sls/configurator-core'
import { ThreeProductViewer } from '@sls/three-renderer'
import type { StudioBuildDraft } from '@sls/order-engine'
import type { ValidationIssue } from '@sls/product-schema'
import type { ArtworkAttachment } from './studio-types'
import { buildCustomizationPreview } from './customization-preview'
import { createRendererMaterialMap } from '@sls/material-library'
import { sampleManifest, sampleProduct } from './sample-product'
import { LeatherMaterialLab } from './LeatherMaterialLab'
import {
  composeScorpionLeather,
  defaultLeatherLabSelection,
  photographedStructureForReference,
  type ScorpionLeatherLabSelection,
} from './scorpion-leather-system'
import {
  preferredMaterialTextureEdge,
  scorpionMaterialById,
  scorpionMaterialDefinitions,
} from './scorpion-materials'

const hoodReferenceMap: Record<string, string> = {
  'hood-dark-yellow': 'dark-textured-yellow-trim',
  'hood-cognac': 'cognac-textured',
  'hood-tan-smooth': 'tan-smooth',
  'hood-tan-textured': 'tan-textured',
}

function resolveHoodConfiguration(referenceId: string) {
  let configuration = createInitialConfiguration(sampleProduct)
  const optionId = hoodReferenceMap[referenceId]

  if (optionId) {
    try {
      configuration = setSelection(sampleProduct, configuration, 'catalogBuild', optionId)
    } catch {
      // The photographed catalog product remains the visual authority if the
      // development renderer cannot resolve a reference.
    }
  }

  return configuration
}

function WeldingHoodViewerComponent({
  referenceId,
  personalization,
  artwork,
}: {
  referenceId: string
  personalization: StudioBuildDraft['personalization']
  artwork: ArtworkAttachment | null
}) {
  const construction = personalization.construction
  const [visorOpen, setVisorOpen] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [cameraPreset, setCameraPreset] = useState(sampleProduct.asset.defaultCameraPreset)
  const [assetIssues, setAssetIssues] = useState<ValidationIssue[]>([])
  const [materialLabOpen, setMaterialLabOpen] = useState(false)
  const [leatherSelection, setLeatherSelection] = useState<ScorpionLeatherLabSelection>(
    () => defaultLeatherLabSelection(referenceId),
  )
  const handleAssetIssues = useCallback((next: ValidationIssue[]) => {
    setAssetIssues((current) => {
      if (
        current.length === next.length &&
        current.every((entry, index) => entry.path === next[index]?.path && entry.message === next[index]?.message)
      ) {
        return current
      }
      return next
    })
  }, [])

  useEffect(() => {
    setLeatherSelection(defaultLeatherLabSelection(referenceId))
  }, [referenceId])

  const configuration = useMemo(() => resolveHoodConfiguration(referenceId), [referenceId])
  const leatherComposition = useMemo(
    () => composeScorpionLeather(leatherSelection),
    [leatherSelection],
  )
  const baseMaterials = useMemo(
    () => createRendererMaterialMap(scorpionMaterialDefinitions, preferredMaterialTextureEdge()),
    [],
  )
  const materials = useMemo(
    () => ({ ...baseMaterials, [leatherComposition.variant.id]: leatherComposition.variant }),
    [baseMaterials, leatherComposition.variant],
  )
  const materialOverrides = useMemo<Record<string, string>>(() => {
    const overrides: Record<string, string> = {
      LeatherPrimary: leatherComposition.variant.id,
    }
    const hardware = construction.hardware
    if (hardware === 'nickel') overrides.HardwarePrimary = 'SCH-001'
    if (hardware === 'antique-brass' || hardware === 'brass') overrides.HardwarePrimary = 'SCH-002'
    return overrides
  }, [construction.hardware, leatherComposition.variant.id])

  const customizationPreview = useMemo(
    () => buildCustomizationPreview(sampleManifest, personalization, artwork),
    [artwork, personalization],
  )
  const animationStates = useMemo(() => ({ 'visor.open': visorOpen }), [visorOpen])

  const activeLeatherMaterial = scorpionMaterialById.get(leatherComposition.structure.materialId)
  const defaultSelection = defaultLeatherLabSelection(referenceId)

  return (
    <div
      className={materialLabOpen ? 'viewer-panel is-material-lab-open' : 'viewer-panel'}
      aria-label="Interactive 3D product viewer"
    >
      <ThreeProductViewer
        product={sampleProduct}
        manifest={sampleManifest}
        materials={materials}
        selections={configuration.selections}
        materialOverrides={materialOverrides}
        customizationLayers={customizationPreview.layers}
        animationStates={animationStates}
        cameraPreset={cameraPreset}
        autoRotate={autoRotate}
        onAssetIssues={handleAssetIssues}
      />

      <div className="view-selector" aria-label="Product views">
        {Object.entries(sampleManifest.cameraPresets).map(([key, preset]) => (
          <button
            type="button"
            key={key}
            className={cameraPreset === key ? 'is-active' : ''}
            aria-pressed={cameraPreset === key}
            onClick={() => {
              setCameraPreset(key)
              setAutoRotate(false)
            }}
          >
            {preset.label ?? key}
          </button>
        ))}
      </div>

      <div className="viewer-actions">
        <button
          type="button"
          className={autoRotate ? 'is-active' : ''}
          aria-pressed={autoRotate}
          onClick={() => setAutoRotate((value) => !value)}
        >
          {autoRotate ? 'Stop spin' : 'Auto spin'}
        </button>
        <button type="button" aria-pressed={visorOpen} onClick={() => setVisorOpen((open) => !open)}>
          {visorOpen ? 'Close visor' : 'Open visor'}
        </button>
        <button
          type="button"
          className={materialLabOpen ? 'is-active' : ''}
          aria-pressed={materialLabOpen}
          aria-controls="sls-material-lab"
          onClick={() => setMaterialLabOpen((open) => !open)}
        >
          Materials
        </button>
        {customizationPreview.renderable && customizationPreview.cameraPreset ? (
          <button
            type="button"
            onClick={() => {
              setCameraPreset(customizationPreview.cameraPreset!)
              setAutoRotate(false)
            }}
          >
            Focus custom
          </button>
        ) : null}
      </div>

      {materialLabOpen ? (
        <div id="sls-material-lab">
          <LeatherMaterialLab
            selection={leatherSelection}
            composition={leatherComposition}
            defaultSelection={defaultSelection}
            onChange={setLeatherSelection}
            onClose={() => setMaterialLabOpen(false)}
          />
        </div>
      ) : null}

      {customizationPreview.active ? (
        <div
          className={`customization-preview-status ${customizationPreview.renderable ? 'is-ready' : 'is-unmapped'}`}
          data-testid="customization-preview-status"
          role="status"
          aria-live="polite"
        >
          {customizationPreview.message}
        </div>
      ) : null}

      <div className="viewer-caption">
        Development digital twin · photographed product is the visual authority
        {activeLeatherMaterial ? ` · ${activeLeatherMaterial.lifecycle}` : ''}
        {leatherComposition.developmentOnly ? ' · development material recipe' : ''}
        {Object.keys(materialOverrides).length ? ' · material-slot preview active' : ''}
        {customizationPreview.renderable ? ' · zone-driven concept overlay active' : ''}
      </div>
      <div className={`asset-status ${assetIssues.length ? 'has-issues' : ''}`}>
        {assetIssues.length
          ? `${assetIssues.length} asset issue${assetIssues.length === 1 ? '' : 's'}`
          : '3D contract validated'}
      </div>
    </div>
  )
}

export default memo(WeldingHoodViewerComponent)
