import type { AssetManifest, ProductDefinition } from '@sls/product-schema'
import type { StudioFamilyKind } from './studio-catalog'

export interface Family3DAsset {
  product: ProductDefinition
  manifest: AssetManifest
  authority: 'G1-development-twin' | 'G2-development-twin'
}

function developmentProduct(familyId: StudioFamilyKind, name: string, model: string): ProductDefinition {
  return {
    schemaVersion: 1,
    id: `sls-${familyId}-development-twin`,
    handle: `sls-${familyId}-development-twin`,
    name,
    category: name,
    currency: 'USD',
    basePrice: 0,
    commerce: {
      defaultMerchandiseId: 'development-only',
      variantStrategy: 'inventory-only',
      priceStatus: 'quote',
      priceNote: '3D development twin only. Shopify catalog remains commerce authority.',
    },
    asset: { manifestUrl: model.replace(/\.gltf$/u, '.manifest.json'), defaultCameraPreset: 'hero' },
    optionGroups: [],
    compatibilityRules: [],
    measurements: [],
    sizeRecommendations: [],
  }
}

const leatherProfile = {
  kind: 'leather' as const, mapping: 'uv0' as const, requiresUv0: true, requiresNormals: true,
  tangents: 'recommended' as const, metersPerUvUnit: 1, uvScaleToleranceRatio: 0.3,
}
const hardwareProfile = {
  kind: 'metal' as const, mapping: 'uv0' as const, requiresUv0: true, requiresNormals: true,
  tangents: 'optional' as const,
}
const allPurposes = ['tooling', 'text', 'logo', 'artwork'] as const
const familyRootById: Readonly<Record<Exclude<StudioFamilyKind, 'welding-hood'>, string>> = {
  'tool-belt': 'Family_ToolBelt',
  'tool-pouch-set': 'Family_ToolPouchSet',
  'work-harness': 'Family_WorkHarness',
  'radio-harness': 'Family_RadioHarness',
  'carpenter-pouch': 'Family_CarpenterPouch',
  'thigh-protector': 'Family_ThighProtector',
  'cooler-strap': 'Family_CoolerStrap',
}

function familyModel(familyId: Exclude<StudioFamilyKind, 'welding-hood'>): string {
  return `/models/development-g2-${familyId}.gltf`
}

function manifest(args: {
  assetId: string
  familyId: Exclude<StudioFamilyKind, 'welding-hood'>
  leatherNodes: string[]
  hardwareNodes?: string[]
  zone: NonNullable<AssetManifest['customizationZones']>[string]
  camera: { target: [number,number,number]; hero: [number,number,number]; front?: [number,number,number]; rear?: [number,number,number] }
  groundY: number
  shadowScale?: number
}): AssetManifest {
  const slots: AssetManifest['materialSlots'] = { LeatherPrimary: args.leatherNodes }
  const profiles: NonNullable<AssetManifest['materialSlotProfiles']> = { LeatherPrimary: leatherProfile }
  const defaults: NonNullable<AssetManifest['defaultMaterialVariants']> = { LeatherPrimary: 'SCL-FINE-DEV' }
  if (args.hardwareNodes?.length) {
    slots.HardwarePrimary = args.hardwareNodes
    profiles.HardwarePrimary = hardwareProfile
    defaults.HardwarePrimary = 'SCH-002'
  }
  return {
    schemaVersion:1, assetId:args.assetId, model:familyModel(args.familyId),
    units:'meters', upAxis:'Y', frontAxis:'-Z', rootNode:'SLS_ProductRoot',
    materialSlots:slots, materialSlotProfiles:profiles, defaultMaterialVariants:defaults,
    customizationZones:{ primary: args.zone },
    components:{ [`family.${args.familyId}`]: [familyRootById[args.familyId]] }, animations:{},
    cameraPresets:{
      hero:{label:'Hero',target:args.camera.target,position:args.camera.hero,fov:35},
      front:{label:'Front',target:args.camera.target,position:args.camera.front ?? [0,args.camera.target[1],1.08],fov:34},
      rear:{label:'Rear',target:args.camera.target,position:args.camera.rear ?? [0,args.camera.target[1],-1.08],fov:34},
    },
    presentation:{groundY:args.groundY,shadowScale:args.shadowScale ?? 1.25,orbit:{minDistance:0.36,maxDistance:2.2,minPolarAngle:0.28,maxPolarAngle:2.65}},
  }
}

const zone=(label:string,node:string,placements:string[],size:[number,number],surfaceZ=0.01) => ({
  label,node,purposes:[...allPurposes],placementLabels:placements,cameraPreset:'front',
  origin:[0,0,surfaceZ] as [number,number,number],normal:[0,0,1] as [number,number,number],up:[0,1,0] as [number,number,number],
  sizeMeters:size,safeInsetMeters:Math.min(size[0],size[1])*0.06,
})

export const family3DAssets: Readonly<Record<StudioFamilyKind, Family3DAsset>> = {
  'welding-hood': {
    product: developmentProduct('welding-hood','Leather Welding Hood','/models/placeholder-welding-hood.gltf'),
    authority:'G1-development-twin',
    manifest:{
      schemaVersion:1,assetId:'placeholder-welding-hood-v7-uv',model:'/models/placeholder-welding-hood.gltf',
      units:'meters',upAxis:'Y',frontAxis:'-Z',rootNode:'SLS_ProductRoot',
      materialSlots:{LeatherPrimary:['Shell_Main','NeckGuard_Standard','NeckGuard_Extended'],HardwarePrimary:['Visor_Frame','Rivets'],Lens:['Visor_Lens']},
      materialSlotProfiles:{
        LeatherPrimary:leatherProfile,HardwarePrimary:hardwareProfile,
        Lens:{kind:'glass',mapping:'uv0',requiresUv0:false,requiresNormals:true,tangents:'optional'},
      },
      defaultMaterialVariants:{LeatherPrimary:'SCL-COGNAC',HardwarePrimary:'SCH-002',Lens:'SGL-001'},
      customizationZones:{
        'front-panel':{label:'Front shell customization area',node:'Shell_Main',purposes:[...allPurposes],
          placementLabels:['Forehead panel'],cameraPreset:'front',
          origin:[0,0.05,0.51],normal:[0,0,1],up:[0,1,0],sizeMeters:[0.22,0.24],safeInsetMeters:0.012},
      },
      components:{'neckGuard.standard':['NeckGuard_Standard'],'neckGuard.extended':['NeckGuard_Extended']},
      animations:{'visor.open':{target:'Visor_Pivot',property:'rotation.x',from:0,to:-1.72,durationMs:420,easing:'easeInOutCubic'}},
      cameraPresets:{
        hero:{label:'Hero',target:[0,0.04,0],position:[0.48,0.28,0.68],fov:35},
        front:{label:'Front',target:[0,0.04,0],position:[0,0.08,0.82],fov:34},
        rear:{label:'Rear',target:[0,0.04,0],position:[0,0.08,-0.82],fov:34},
        detail:{label:'Visor',target:[0,0.12,0.13],position:[0.34,0.24,0.48],fov:27},
      },
      presentation:{groundY:-0.34,shadowScale:1.2,orbit:{minDistance:0.38,maxDistance:1.6,minPolarAngle:0.35,maxPolarAngle:2.55}},
    },
  },
  'tool-belt': {
    product:developmentProduct('tool-belt','Leather Tool Belt Rig',familyModel('tool-belt')),authority:'G2-development-twin',
    manifest:manifest({assetId:'development-tool-belt-v2',familyId:'tool-belt',
      leatherNodes:['Belt_Main','Pouch_Left','Pouch_Center','Pouch_Right'],hardwareNodes:['Hardware_Left','Hardware_Right'],
      zone:zone('Primary pouch face','Pouch_Left',['Primary pouch face'],[0.18,0.20],0.106),
      camera:{target:[0,-0.03,0.02],hero:[0.78,0.38,1.12]},groundY:-0.24,shadowScale:1.55}),
  },
  'tool-pouch-set': {
    product:developmentProduct('tool-pouch-set','Leather Tool Pouch Set',familyModel('tool-pouch-set')),authority:'G2-development-twin',
    manifest:manifest({assetId:'development-tool-pouch-set-v2',familyId:'tool-pouch-set',
      leatherNodes:['Large_Pouch','Large_Flap','Small_Pouch','Small_Flap','Belt_Loops'],hardwareNodes:['Hardware_Rivets'],
      zone:zone('Large pouch face','Large_Pouch',['Large pouch face'],[0.24,0.28],0.127),
      camera:{target:[0,0,0.02],hero:[0.62,0.42,0.92]},groundY:-0.28}),
  },
  'work-harness': {
    product:developmentProduct('work-harness','Leather Work Harness',familyModel('work-harness')),authority:'G2-development-twin',
    manifest:manifest({assetId:'development-work-harness-v2',familyId:'work-harness',
      leatherNodes:['Back_Panel','Shoulder_Left','Shoulder_Right','Lower_Panel','Carry_Left','Carry_Right'],hardwareNodes:['Hardware_Buckles'],
      zone:zone('Back panel','Back_Panel',['Back panel'],[0.24,0.25],0.005),
      camera:{target:[0,0.05,0],hero:[0.72,0.48,1.05]},groundY:-0.40,shadowScale:1.45}),
  },
  'radio-harness': {
    product:developmentProduct('radio-harness','Leather Radio Harness',familyModel('radio-harness')),authority:'G2-development-twin',
    manifest:manifest({assetId:'development-radio-harness-v2',familyId:'radio-harness',
      leatherNodes:['Chest_Panel','Strap_Left','Strap_Right','Radio_Pocket_Left','Radio_Pocket_Right','Pocket_Flaps'],hardwareNodes:['Hardware_Buckles_Radio'],
      zone:zone('Front chest panel','Chest_Panel',['Front chest panel'],[0.21,0.20],0.005),
      camera:{target:[0,0.04,0],hero:[0.70,0.48,1.0]},groundY:-0.40,shadowScale:1.4}),
  },
  'carpenter-pouch': {
    product:developmentProduct('carpenter-pouch','Carpenter Tool Pouch',familyModel('carpenter-pouch')),authority:'G2-development-twin',
    manifest:manifest({assetId:'development-carpenter-pouch-v2',familyId:'carpenter-pouch',
      leatherNodes:['Main_Pouch','Upper_Panel','Pocket_Flap','Belt_Loop'],hardwareNodes:['Hardware_Rivets_Carpenter'],
      zone:zone('Front pouch face','Main_Pouch',['Front pouch face'],[0.29,0.31],0.145),
      camera:{target:[0,0,0.03],hero:[0.56,0.40,0.84]},groundY:-0.31}),
  },
  'thigh-protector': {
    product:developmentProduct('thigh-protector','Leather Thigh Protector',familyModel('thigh-protector')),authority:'G2-development-twin',
    manifest:manifest({assetId:'development-thigh-protector-v2',familyId:'thigh-protector',
      leatherNodes:['Main_Panel','Upper_Strap','Lower_Panel_Thigh'],hardwareNodes:['Buckle'],
      zone:zone('Main leather panel','Main_Panel',['Main leather panel'],[0.27,0.40],0.005),
      camera:{target:[0,0,0],hero:[0.55,0.40,0.88]},groundY:-0.33}),
  },
  'cooler-strap': {
    product:developmentProduct('cooler-strap','Cow Leather Cooler Strap',familyModel('cooler-strap')),authority:'G2-development-twin',
    manifest:manifest({assetId:'development-cooler-strap-v2',familyId:'cooler-strap',
      leatherNodes:['Center_Strap','Shoulder_Pad','Buckle_End_Left','Buckle_End_Right'],hardwareNodes:['Hardware_Buckles_Cooler'],
      zone:zone('Center strap','Shoulder_Pad',['Center strap'],[0.25,0.10],0.007),
      camera:{target:[0,0,0],hero:[0.42,0.48,1.30],front:[0,0.08,1.38],rear:[0,0.08,-1.38]},groundY:-0.11,shadowScale:1.9}),
  },
}
