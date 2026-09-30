import type { AssetCustomizationPurpose, AssetCustomizationZone, AssetManifest, ProductDefinition } from '@sls/product-schema'
import type { StudioFamilyKind } from './studio-catalog'

export interface Studio3dDefinition {
  authority: 'G1-visual-reference'
  product: ProductDefinition
  manifest: AssetManifest
}
interface FamilySpec {
  familyId: Exclude<StudioFamilyKind, 'welding-hood'>
  title: string
  model: string
  leatherNodes: string[]
  hardwareNodes: string[]
  zones: Record<string, { label: string; node: string; placementLabels: string[]; sizeMeters: [number, number]; cameraPreset?: 'front' | 'detail' }>
  target?: [number, number, number]
  hero?: [number, number, number]
  groundY?: number
}
function makeDefinition(spec: FamilySpec): Studio3dDefinition {
  const target=spec.target??[0,0.05,0]
  const hero=spec.hero??[1.05,0.55,1.55]
  const product:ProductDefinition={
    schemaVersion:1,id:`sls-g1-${spec.familyId}`,handle:`sls-g1-${spec.familyId}`,
    name:`${spec.title} G1 visual-reference twin`,category:'Development digital twin',
    currency:'USD',basePrice:0,
    commerce:{defaultMerchandiseId:`development:${spec.familyId}`,variantStrategy:'inventory-only',priceStatus:'quote',priceNote:'G1 visual-reference geometry only. Shopify/catalog product remains commerce authority.'},
    asset:{manifestUrl:`/models/g1-${spec.familyId}.manifest.json`,defaultCameraPreset:'hero'},
    optionGroups:[],compatibilityRules:[],measurements:[],sizeRecommendations:[],
  }
  const customizationZones: Record<string, AssetCustomizationZone> = Object.fromEntries(
    Object.entries(spec.zones).map(([zoneId,zone])=>[zoneId,{
    label:zone.label,node:zone.node,purposes:['tooling','text','logo','artwork'] as AssetCustomizationPurpose[],
    placementLabels:zone.placementLabels,cameraPreset:zone.cameraPreset??'detail',
    origin:[0,0,0.51] as [number,number,number],normal:[0,0,1] as [number,number,number],
    up:[0,1,0] as [number,number,number],sizeMeters:zone.sizeMeters,
    safeInsetMeters:Math.min(...zone.sizeMeters)*0.06,
  }]),
  )
  const manifest:AssetManifest={
    schemaVersion:1,assetId:`g1-${spec.familyId}-v036`,model:spec.model,units:'meters',upAxis:'Y',frontAxis:'-Z',rootNode:'SLS_ProductRoot',
    materialSlots:{LeatherPrimary:spec.leatherNodes,HardwarePrimary:spec.hardwareNodes},
    materialSlotProfiles:{
      LeatherPrimary:{kind:'leather',mapping:'uv0',requiresUv0:true,requiresNormals:true,tangents:'recommended',metersPerUvUnit:1,uvScaleToleranceRatio:0.3},
      HardwarePrimary:{kind:'metal',mapping:'uv0',requiresUv0:true,requiresNormals:true,tangents:'optional'},
    },
    defaultMaterialVariants:{LeatherPrimary:'SCL-FINE-GRAIN-DEV',HardwarePrimary:'SCH-002'},
    customizationZones,components:{},animations:{},
    cameraPresets:{
      hero:{label:'Hero',target,position:hero,fov:35},
      front:{label:'Front',target,position:[0,target[1]+0.05,1.75],fov:34},
      side:{label:'Side',target,position:[1.75,target[1]+0.05,0.08],fov:34},
      detail:{label:'Detail',target,position:[0.58,target[1]+0.12,1.05],fov:30},
    },
    presentation:{groundY:spec.groundY??-0.5,shadowScale:1.45,orbit:{minDistance:0.55,maxDistance:3.2,minPolarAngle:0.35,maxPolarAngle:2.45}},
  }
  return {authority:'G1-visual-reference',product,manifest}
}
const specs:FamilySpec[]=[
 {familyId:'tool-belt',title:'Leather Tool Belt Rig',model:'/models/g1-tool-belt.gltf',leatherNodes:['Belt_Main','Pouch_Left','Pouch_Center','Pouch_Right','Pocket_Left','Pocket_Right'],hardwareNodes:['Hardware_Buckle'],zones:{'belt-center':{label:'Belt center concept zone',node:'Belt_Main',placementLabels:['Belt center'],sizeMeters:[0.32,0.075]},'primary-pouch':{label:'Primary pouch face concept zone',node:'Pouch_Center',placementLabels:['Primary pouch face'],sizeMeters:[0.25,0.22]},'secondary-pouch':{label:'Secondary pouch face concept zone',node:'Pouch_Left',placementLabels:['Secondary pouch face'],sizeMeters:[0.2,0.18]}},target:[0,-0.05,0],hero:[1.15,0.45,1.55],groundY:-0.46},
 {familyId:'tool-pouch-set',title:'Leather Tool Pouch Set',model:'/models/g1-tool-pouch-set.gltf',leatherNodes:['Pouch_Large','Flap_Large','Pouch_Small','Flap_Small','Belt_Loop_Large','Belt_Loop_Small'],hardwareNodes:['Hardware_Rivet_1','Hardware_Rivet_2'],zones:{'large-pouch':{label:'Large pouch face concept zone',node:'Pouch_Large',placementLabels:['Large pouch face'],sizeMeters:[0.24,0.22]},'small-pouch':{label:'Small pouch face concept zone',node:'Pouch_Small',placementLabels:['Small pouch face'],sizeMeters:[0.17,0.16]},'pocket-flap':{label:'Pocket flap concept zone',node:'Flap_Large',placementLabels:['Pocket flap'],sizeMeters:[0.22,0.08]},'belt-attachment':{label:'Belt attachment concept zone',node:'Belt_Loop_Large',placementLabels:['Belt attachment'],sizeMeters:[0.08,0.11]}},target:[0,-0.02,0],hero:[1.05,0.48,1.45],groundY:-0.44},
 {familyId:'work-harness',title:'Leather Work Harness',model:'/models/g1-work-harness.gltf',leatherNodes:['Back_Panel','Shoulder_Left','Shoulder_Right','Waist_Belt','Lower_Panel'],hardwareNodes:['Hardware_Ring_L','Hardware_Ring_R'],zones:{'back-panel':{label:'Back panel concept zone',node:'Back_Panel',placementLabels:['Back panel','Chest area'],sizeMeters:[0.27,0.24]},'shoulder-strap':{label:'Shoulder strap concept zone',node:'Shoulder_Left',placementLabels:['Shoulder strap'],sizeMeters:[0.07,0.2]},'lower-panel':{label:'Lower carry panel concept zone',node:'Lower_Panel',placementLabels:['Lower carry panel'],sizeMeters:[0.3,0.18]}},target:[0,0.18,0],hero:[1,0.65,1.65],groundY:-0.48},
 {familyId:'radio-harness',title:'Leather Radio Harness',model:'/models/g1-radio-harness.gltf',leatherNodes:['Chest_Panel','Radio_Pouch_Left','Radio_Pouch_Right','Shoulder_Left','Shoulder_Right','Back_Strap'],hardwareNodes:['Hardware_Ring_L','Hardware_Ring_R'],zones:{'chest-panel':{label:'Front chest panel concept zone',node:'Chest_Panel',placementLabels:['Front chest panel'],sizeMeters:[0.24,0.18]},'radio-pocket':{label:'Radio pocket face concept zone',node:'Radio_Pouch_Left',placementLabels:['Radio pocket face'],sizeMeters:[0.12,0.19]},'shoulder-strap':{label:'Shoulder strap concept zone',node:'Shoulder_Left',placementLabels:['Shoulder strap'],sizeMeters:[0.07,0.2]},'back-strap':{label:'Back strap concept zone',node:'Back_Strap',placementLabels:['Back strap'],sizeMeters:[0.24,0.06]}},target:[0,0.2,0],hero:[1,0.68,1.6],groundY:-0.46},
 {familyId:'carpenter-pouch',title:'Carpenter Tool Pouch',model:'/models/g1-carpenter-pouch.gltf',leatherNodes:['Pouch_Body','Front_Pocket','Upper_Panel','Belt_Loop','Side_Pocket'],hardwareNodes:['Hardware_Rivet_L','Hardware_Rivet_R'],zones:{'front-pouch':{label:'Front pouch face concept zone',node:'Pouch_Body',placementLabels:['Front pouch face'],sizeMeters:[0.26,0.24]},'upper-panel':{label:'Upper panel concept zone',node:'Upper_Panel',placementLabels:['Upper panel','Pocket flap'],sizeMeters:[0.23,0.09]},'belt-loop':{label:'Belt loop concept zone',node:'Belt_Loop',placementLabels:['Belt loop'],sizeMeters:[0.08,0.1]}},target:[0,0,0],hero:[0.9,0.38,1.3],groundY:-0.42},
 {familyId:'thigh-protector',title:'Leather Thigh Protector',model:'/models/g1-thigh-protector.gltf',leatherNodes:['Protector_Main','Upper_Strap','Lower_Strap','Reinforcement'],hardwareNodes:['Hardware_Buckle_Upper','Hardware_Buckle_Lower'],zones:{'main-panel':{label:'Main leather panel concept zone',node:'Protector_Main',placementLabels:['Main leather panel'],sizeMeters:[0.25,0.31]},'upper-strap':{label:'Upper strap concept zone',node:'Upper_Strap',placementLabels:['Upper strap area'],sizeMeters:[0.2,0.06]},'lower-panel':{label:'Lower panel concept zone',node:'Reinforcement',placementLabels:['Lower panel'],sizeMeters:[0.21,0.1]}},target:[0,0.05,0],hero:[0.85,0.42,1.3],groundY:-0.48},
 {familyId:'cooler-strap',title:'Cow Leather Cooler Strap',model:'/models/g1-cooler-strap.gltf',leatherNodes:['Strap_Main','Shoulder_Pad','End_Tab_Top','End_Tab_Bottom'],hardwareNodes:['Hardware_Buckle_Top','Hardware_Buckle_Bottom'],zones:{'center-strap':{label:'Center strap concept zone',node:'Strap_Main',placementLabels:['Center strap'],sizeMeters:[0.28,0.07]},'buckle-end':{label:'Near buckle end concept zone',node:'End_Tab_Bottom',placementLabels:['Near buckle end'],sizeMeters:[0.12,0.065]},'shoulder-section':{label:'Shoulder section concept zone',node:'Shoulder_Pad',placementLabels:['Shoulder section'],sizeMeters:[0.24,0.11]}},target:[0,0,0],hero:[1.05,0.42,1.5],groundY:-0.5},
]
export const studio3dDefinitions=new Map(specs.map(spec=>[spec.familyId,makeDefinition(spec)] as const))
export function getStudio3dDefinition(familyId:StudioFamilyKind):Studio3dDefinition|undefined {
  if(familyId==='welding-hood') return undefined
  return studio3dDefinitions.get(familyId)
}
