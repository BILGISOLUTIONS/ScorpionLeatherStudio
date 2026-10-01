import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ThreeProductViewer } from '@sls/three-renderer'
import type { StudioBuildDraft } from '@sls/order-engine'
import type { ValidationIssue } from '@sls/product-schema'
import type { ArtworkAttachment } from './studio-types'
import type { StudioFamilyKind } from './studio-catalog'
import { buildCustomizationPreview } from './customization-preview'
import { createRendererMaterialMap } from '@sls/material-library'
import { family3DAssets } from './family-3d-assets'
import { LeatherMaterialLab } from './LeatherMaterialLab'
import { composeScorpionLeather, defaultLeatherLabSelection, type ScorpionLeatherLabSelection } from './scorpion-leather-system'
import { preferredMaterialTextureEdge, scorpionMaterialById, scorpionMaterialDefinitions } from './scorpion-materials'

function ProductFamilyViewerComponent({ familyId, referenceId, personalization, artwork }: {
  familyId: StudioFamilyKind
  referenceId: string
  personalization: StudioBuildDraft['personalization']
  artwork: ArtworkAttachment | null
}) {
  const asset = family3DAssets[familyId]
  const defaultSelection = useMemo(() => defaultLeatherLabSelection(referenceId), [referenceId])
  const [leatherSelection,setLeatherSelection]=useState<ScorpionLeatherLabSelection>(defaultSelection)
  const [autoRotate,setAutoRotate]=useState(false)
  const [cameraPreset,setCameraPreset]=useState(asset.product.asset.defaultCameraPreset)
  const [assetIssues,setAssetIssues]=useState<ValidationIssue[]>([])
  const [materialLabOpen,setMaterialLabOpen]=useState(false)
  const [visorOpen,setVisorOpen]=useState(false)

  useEffect(()=>{
    setLeatherSelection(defaultSelection)
    setCameraPreset(asset.product.asset.defaultCameraPreset)
    setAutoRotate(false)
    setVisorOpen(false)
  },[asset.product.asset.defaultCameraPreset,defaultSelection,familyId,referenceId])

  const handleAssetIssues=useCallback((next:ValidationIssue[])=>{
    setAssetIssues((current)=>{
      if(current.length===next.length && current.every((entry,index)=>entry.path===next[index]?.path && entry.message===next[index]?.message)) return current
      return next
    })
  },[])

  const leatherComposition=useMemo(()=>composeScorpionLeather(leatherSelection),[leatherSelection])
  const baseMaterials=useMemo(()=>createRendererMaterialMap(scorpionMaterialDefinitions,preferredMaterialTextureEdge()),[])
  const materials=useMemo(()=>({...baseMaterials,[leatherComposition.variant.id]:leatherComposition.variant}),[baseMaterials,leatherComposition.variant])
  const materialOverrides=useMemo<Record<string,string>>(()=>{
    const overrides:Record<string,string>={LeatherPrimary:leatherComposition.variant.id}
    const hardware=personalization.construction.hardware
    if(hardware==='nickel') overrides.HardwarePrimary='SCH-001'
    if(hardware==='antique-brass'||hardware==='brass') overrides.HardwarePrimary='SCH-002'
    return overrides
  },[personalization.construction.hardware,leatherComposition.variant.id])

  const componentOverrides=useMemo<Record<string,string>>(() => {
    const overrides: Record<string,string> = {}
    if (familyId === 'welding-hood') overrides.neckGuard = 'standard'
    else overrides.family = familyId
    return overrides
  },[familyId])

  const customizationPreview=useMemo(()=>buildCustomizationPreview(asset.manifest,personalization,artwork),[asset.manifest,personalization,artwork])
  const animationStates=useMemo<Record<string,boolean>>(() => {
    const states: Record<string,boolean> = {}
    if (familyId === 'welding-hood') states['visor.open'] = visorOpen
    return states
  },[familyId,visorOpen])
  const activeLeatherMaterial=scorpionMaterialById.get(leatherComposition.structure.materialId)
  const twinLabel=asset.authority==='G2-development-twin'?'G2 development digital twin':'G1 development digital twin'

  return <div className={materialLabOpen?'viewer-panel is-material-lab-open':'viewer-panel'} aria-label="Interactive 3D product viewer">
    <ThreeProductViewer product={asset.product} manifest={asset.manifest} materials={materials} selections={{}}
      componentOverrides={componentOverrides} materialOverrides={materialOverrides} customizationLayers={customizationPreview.layers}
      animationStates={animationStates} cameraPreset={cameraPreset} autoRotate={autoRotate} onAssetIssues={handleAssetIssues}/>

    <div className="view-selector" aria-label="Product views">
      {Object.entries(asset.manifest.cameraPresets).map(([key,preset])=><button type="button" key={key}
        className={cameraPreset===key?'is-active':''} aria-pressed={cameraPreset===key}
        onClick={()=>{setCameraPreset(key);setAutoRotate(false)}}>{preset.label??key}</button>)}
    </div>

    <div className="viewer-actions">
      <button type="button" className={autoRotate?'is-active':''} aria-pressed={autoRotate} onClick={()=>setAutoRotate(value=>!value)}>
        {autoRotate?'Stop spin':'Auto spin'}
      </button>
      {familyId==='welding-hood'?<button type="button" aria-pressed={visorOpen} onClick={()=>setVisorOpen(open=>!open)}>
        {visorOpen?'Close visor':'Open visor'}
      </button>:null}
      <button type="button" className={materialLabOpen?'is-active':''} aria-pressed={materialLabOpen} aria-controls="sls-material-lab"
        onClick={()=>setMaterialLabOpen(open=>!open)}>Materials</button>
      {customizationPreview.renderable&&customizationPreview.cameraPreset?<button type="button" onClick={()=>{
        setCameraPreset(customizationPreview.cameraPreset!);setAutoRotate(false)
      }}>Focus custom</button>:null}
    </div>

    {materialLabOpen?<div id="sls-material-lab"><LeatherMaterialLab selection={leatherSelection} composition={leatherComposition}
      defaultSelection={defaultSelection}
      resetLabel={familyId === 'welding-hood' ? 'Reset to photographed reference' : 'Reset product preview'}
      onChange={setLeatherSelection} onClose={()=>setMaterialLabOpen(false)}/></div>:null}

    {customizationPreview.active?<div className={`customization-preview-status ${customizationPreview.renderable?'is-ready':'is-unmapped'}`}
      data-testid="customization-preview-status" role="status" aria-live="polite">{customizationPreview.message}</div>:null}

    <div className="viewer-caption">
      {twinLabel} · photographed product remains visual authority
      {activeLeatherMaterial?` · ${activeLeatherMaterial.lifecycle}`:''}
      {leatherComposition.developmentOnly?' · development material recipe':''}
      {' · UV/PBR material preview active'}
      {customizationPreview.renderable?' · zone-driven concept overlay active':''}
    </div>
    <div className={`asset-status ${assetIssues.length?'has-issues':''}`}>
      {assetIssues.length?`${assetIssues.length} asset issue${assetIssues.length===1?'':'s'}`:'3D contract validated'}
    </div>
  </div>
}

export default memo(ProductFamilyViewerComponent)
