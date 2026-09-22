import { memo, useMemo, useState } from 'react'
import { createInitialConfiguration, setSelection } from '@sls/configurator-core'
import { ThreeProductViewer } from '@sls/three-renderer'
import type { ValidationIssue } from '@sls/product-schema'
import { sampleManifest, sampleMaterials, sampleProduct } from './sample-product'

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

function WeldingHoodViewerComponent({ referenceId }: { referenceId: string }) {
  const [visorOpen, setVisorOpen] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [cameraPreset, setCameraPreset] = useState(sampleProduct.asset.defaultCameraPreset)
  const [assetIssues, setAssetIssues] = useState<ValidationIssue[]>([])
  const configuration = useMemo(() => resolveHoodConfiguration(referenceId), [referenceId])

  return (
    <div className="viewer-panel" aria-label="Interactive 3D product viewer">
      <ThreeProductViewer
        product={sampleProduct}
        manifest={sampleManifest}
        materials={sampleMaterials}
        selections={configuration.selections}
        animationStates={{ 'visor.open': visorOpen }}
        cameraPreset={cameraPreset}
        autoRotate={autoRotate}
        onAssetIssues={setAssetIssues}
      />

      <div className="view-selector" aria-label="Product views">
        {Object.entries(sampleManifest.cameraPresets).map(([key, preset]) => (
          <button
            type="button"
            key={key}
            className={cameraPreset === key ? 'is-active' : ''}
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
          onClick={() => setAutoRotate((value) => !value)}
        >
          {autoRotate ? 'Stop spin' : 'Auto spin'}
        </button>
        <button type="button" onClick={() => setVisorOpen((open) => !open)}>
          {visorOpen ? 'Close visor' : 'Open visor'}
        </button>
      </div>

      <div className="viewer-caption">
        Development digital twin · photographed product is the visual authority
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
