export interface ReconstructionPrepCandidate {
  candidateId: string
  assetId: string
  modelFile: {
    name: string
  }
}

export interface ReconstructionPrepRecipe {
  schemaVersion: 1
  candidateId: string
  assetId: string
  sourceModelFile: string
  handoffFile: string
  normalizedModelFile: string
  reportFile: string
  blenderFile: string
  command: string
  productionApproved: false
  notes: string[]
}

function quote(value: string): string {
  return '"' + value.replaceAll('"', '\\"') + '"'
}

function safePart(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-_]+/gu, '-').replace(/^-+|-+$/gu, '')
  return normalized || fallback
}

export function buildReconstructionPrepRecipe(candidate: ReconstructionPrepCandidate): ReconstructionPrepRecipe {
  const candidateId = candidate.candidateId.trim()
  if (!candidateId) throw new Error('candidateId: Candidate ID is required.')
  const assetId = candidate.assetId.trim()
  if (!assetId) throw new Error('assetId: Asset ID is required.')
  const sourceModelFile = candidate.modelFile.name.trim()
  if (!sourceModelFile) throw new Error('modelFile.name: Raw candidate filename is required.')

  const base = safePart(assetId, 'sls-digital-twin')
  const handoffFile = candidateId.toLowerCase() + '-processing-handoff.json'
  const normalizedModelFile = base + '-normalized.glb'
  const reportFile = base + '-normalized.prep.json'
  const blenderFile = base + '-normalized.blend'
  const command = [
    'blender --background',
    '--python scripts/blender/sls_reconstruction_prepare.py',
    '--',
    '--input ' + quote(sourceModelFile),
    '--handoff ' + quote(handoffFile),
    '--output ' + quote(normalizedModelFile),
    '--report ' + quote(reportFile),
    '--save-blend ' + quote(blenderFile),
  ].join(' ')

  return {
    schemaVersion: 1,
    candidateId,
    assetId,
    sourceModelFile,
    handoffFile,
    normalizedModelFile,
    reportFile,
    blenderFile,
    command,
    productionApproved: false,
    notes: [
      'The preparation stage applies only uniform physical scaling; it never stretches one axis to force a match.',
      'Provider UVs/materials are preserved as reconstruction reference data. Production Scorpion materials still require the approved material pipeline.',
      'Semantic mesh names, material-slot ownership, hinges and customization zones are never guessed from provider geometry.',
      'The preparation report may require manual geometry/semantic authoring before the normalized candidate can pass Digital Twin QA.',
    ],
  }
}
