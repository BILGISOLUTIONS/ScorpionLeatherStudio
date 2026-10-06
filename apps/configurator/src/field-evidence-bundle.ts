import type { ProductConstructionPacket } from '@sls/product-capture'
import { sha256Hex } from './capture-integrity'
import { parseProductConstructionPacket } from './digital-twin-ingestion-core'
import { readStoredZip, type StoredZipArchive } from './stored-zip-reader'

export interface FieldBundleSourceIndex {
  role?: string
  label?: string
  required?: boolean
  archivePath: string
  originalName: string
  sizeBytes: number
  type: string
  lastModified: number
  sha256: string
  imageWidthPx?: number
  imageHeightPx?: number
}

export interface FieldEvidenceBundleIndex {
  schemaVersion: 1
  bundleType: 'sls-product-capture-evidence'
  generatedAt: string
  productId: string
  productLabel: string
  captureSessionId: string
  capturePlanId: string
  assetId: string
  authority: {
    singlePhysicalUnitConfirmed: boolean
    physicalProductRemainsGeometryAuthority: boolean
    localOnlyPackaging: boolean
  }
  totals: {
    roleReferences: number
    supplementalReferences: number
    sourceImages: number
    sourceBytes: number
  }
  qualityPreflight?: {
    ready?: boolean
    blockerCount?: number
    warningCount?: number
    inspectableImages?: number
    recommendedResolutionImages?: number
    lowResolutionImages?: number
    cautiousFormatImages?: number
    duplicateGroups?: number
  }
  references: FieldBundleSourceIndex[]
  supplemental: FieldBundleSourceIndex[]
}

export interface VerifiedFieldEvidenceBundle {
  fileName: string
  construction: ProductConstructionPacket
  index: FieldEvidenceBundleIndex
  archive: StoredZipArchive
  roleSources: Map<string, { index: FieldBundleSourceIndex; blob: Blob }>
  supplementalSources: Array<{ index: FieldBundleSourceIndex; blob: Blob }>
  verifiedFiles: number
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path + ' must be an object.')
  return value as Record<string, unknown>
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(path + ' must be a non-empty string.')
  return value
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(path + ' must be a finite non-negative number.')
  return value
}

function shaValue(value: unknown, path: string): string {
  const digest = stringValue(value, path)
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(path + ' must be a lowercase SHA-256 digest.')
  return digest
}

function sourceIndex(value: unknown, path: string, roleRequired: boolean): FieldBundleSourceIndex {
  const item = record(value, path)
  const result: FieldBundleSourceIndex = {
    archivePath: stringValue(item.archivePath, path + '.archivePath'),
    originalName: stringValue(item.originalName, path + '.originalName'),
    sizeBytes: numberValue(item.sizeBytes, path + '.sizeBytes'),
    type: stringValue(item.type, path + '.type'),
    lastModified: numberValue(item.lastModified, path + '.lastModified'),
    sha256: shaValue(item.sha256, path + '.sha256'),
  }
  if (roleRequired) {
    result.role = stringValue(item.role, path + '.role')
    result.label = stringValue(item.label, path + '.label')
    result.required = item.required === true
  }
  if (item.imageWidthPx !== undefined) result.imageWidthPx = numberValue(item.imageWidthPx, path + '.imageWidthPx')
  if (item.imageHeightPx !== undefined) result.imageHeightPx = numberValue(item.imageHeightPx, path + '.imageHeightPx')
  return result
}

export function parseFieldEvidenceBundleIndex(value: unknown): FieldEvidenceBundleIndex {
  const input = record(value, 'bundleIndex')
  if (input.schemaVersion !== 1) throw new Error('bundleIndex.schemaVersion is unsupported.')
  if (input.bundleType !== 'sls-product-capture-evidence') throw new Error('This ZIP is not an SLS product-capture evidence bundle.')
  const authority = record(input.authority, 'bundleIndex.authority')
  if (
    authority.singlePhysicalUnitConfirmed !== true
    || authority.physicalProductRemainsGeometryAuthority !== true
    || authority.localOnlyPackaging !== true
  ) {
    throw new Error('Field bundle authority contract is incomplete.')
  }
  const totals = record(input.totals, 'bundleIndex.totals')
  const references = Array.isArray(input.references)
    ? input.references.map((entry, index) => sourceIndex(entry, 'bundleIndex.references[' + index + ']', true))
    : (() => { throw new Error('bundleIndex.references must be an array.') })()
  const supplemental = Array.isArray(input.supplemental)
    ? input.supplemental.map((entry, index) => sourceIndex(entry, 'bundleIndex.supplemental[' + index + ']', false))
    : (() => { throw new Error('bundleIndex.supplemental must be an array.') })()

  const parsed: FieldEvidenceBundleIndex = {
    schemaVersion: 1,
    bundleType: 'sls-product-capture-evidence',
    generatedAt: stringValue(input.generatedAt, 'bundleIndex.generatedAt'),
    productId: stringValue(input.productId, 'bundleIndex.productId'),
    productLabel: stringValue(input.productLabel, 'bundleIndex.productLabel'),
    captureSessionId: stringValue(input.captureSessionId, 'bundleIndex.captureSessionId'),
    capturePlanId: stringValue(input.capturePlanId, 'bundleIndex.capturePlanId'),
    assetId: stringValue(input.assetId, 'bundleIndex.assetId'),
    authority: {
      singlePhysicalUnitConfirmed: true,
      physicalProductRemainsGeometryAuthority: true,
      localOnlyPackaging: true,
    },
    totals: {
      roleReferences: numberValue(totals.roleReferences, 'bundleIndex.totals.roleReferences'),
      supplementalReferences: numberValue(totals.supplementalReferences, 'bundleIndex.totals.supplementalReferences'),
      sourceImages: numberValue(totals.sourceImages, 'bundleIndex.totals.sourceImages'),
      sourceBytes: numberValue(totals.sourceBytes, 'bundleIndex.totals.sourceBytes'),
    },
    references,
    supplemental,
  }

  if (input.qualityPreflight && typeof input.qualityPreflight === 'object') {
    parsed.qualityPreflight = input.qualityPreflight as FieldEvidenceBundleIndex['qualityPreflight']
  }
  if (parsed.totals.roleReferences !== references.length || parsed.totals.supplementalReferences !== supplemental.length) {
    throw new Error('Field bundle source counts do not match the bundle index.')
  }
  if (parsed.totals.sourceImages !== references.length + supplemental.length) {
    throw new Error('Field bundle total source-image count is inconsistent.')
  }
  if (parsed.qualityPreflight?.ready === false || (parsed.qualityPreflight?.blockerCount ?? 0) > 0) {
    throw new Error('Field bundle reports unresolved capture-quality blockers.')
  }
  return parsed
}

function parseChecksumLedger(text: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim()
    if (!line) continue
    const match = line.match(/^([a-f0-9]{64})  (.+)$/u)
    if (!match) throw new Error('SHA256SUMS.txt contains an invalid line.')
    const [, digest, path] = match
    if (path === 'SHA256SUMS.txt') throw new Error('SHA256SUMS.txt must not self-reference.')
    if (result.has(path!)) throw new Error('SHA256SUMS.txt contains duplicate path: ' + path)
    result.set(path!, digest!)
  }
  return result
}

async function textFile(archive: StoredZipArchive, path: string): Promise<string> {
  const entry = archive.files.get(path)
  if (!entry) throw new Error('Field bundle is missing ' + path + '.')
  return entry.blob.text()
}

export async function loadVerifiedFieldEvidenceBundle(file: File): Promise<VerifiedFieldEvidenceBundle> {
  const archive = await readStoredZip(file)
  const ledger = parseChecksumLedger(await textFile(archive, 'SHA256SUMS.txt'))
  const expectedPaths = [...archive.files.keys()].filter((path) => path !== 'SHA256SUMS.txt').sort()
  const ledgerPaths = [...ledger.keys()].sort()
  if (expectedPaths.join('\n') !== ledgerPaths.join('\n')) {
    throw new Error('SHA256SUMS.txt does not cover every field-bundle member exactly once.')
  }

  for (const path of expectedPaths) {
    const entry = archive.files.get(path)!
    const actual = await sha256Hex(entry.blob)
    if (actual !== ledger.get(path)) throw new Error('SHA-256 verification failed for ' + path + '.')
  }

  const index = parseFieldEvidenceBundleIndex(JSON.parse(await textFile(archive, 'metadata/capture-bundle-index.json')))
  const construction = parseProductConstructionPacket(JSON.parse(await textFile(archive, 'metadata/construction-packet.json')))

  if (
    index.productId !== construction.productId
    || index.captureSessionId !== construction.sourceCaptureSessionId
    || index.capturePlanId !== construction.capturePlanId
  ) {
    throw new Error('Field-bundle index and construction packet provenance do not match.')
  }

  const constructionByKey = new Map(construction.referenceCoverage.map((entry) => [entry.key, entry]))
  const roleSources = new Map<string, { index: FieldBundleSourceIndex; blob: Blob }>()
  let indexedBytes = 0
  for (const source of index.references) {
    const role = source.role!
    if (roleSources.has(role)) throw new Error('Field bundle contains duplicate capture role: ' + role)
    const archived = archive.files.get(source.archivePath)
    if (!archived) throw new Error('Field bundle source file is missing: ' + source.archivePath)
    if (archived.size !== source.sizeBytes) throw new Error('Field bundle source size mismatch: ' + source.archivePath)
    if (ledger.get(source.archivePath) !== source.sha256) throw new Error('Field bundle source SHA-256 does not match its index: ' + source.archivePath)
    const constructionSource = constructionByKey.get(role)
    if (!constructionSource) throw new Error('Field bundle role is absent from the construction packet: ' + role)
    if (constructionSource.sha256 && constructionSource.sha256 !== source.sha256) {
      throw new Error('Construction packet source SHA-256 does not match the field bundle: ' + role)
    }
    indexedBytes += source.sizeBytes
    roleSources.set(role, { index: source, blob: archived.blob })
  }

  const supplementalSources: Array<{ index: FieldBundleSourceIndex; blob: Blob }> = []
  for (const source of index.supplemental) {
    const archived = archive.files.get(source.archivePath)
    if (!archived) throw new Error('Field bundle supplemental file is missing: ' + source.archivePath)
    if (archived.size !== source.sizeBytes || ledger.get(source.archivePath) !== source.sha256) {
      throw new Error('Field bundle supplemental provenance mismatch: ' + source.archivePath)
    }
    indexedBytes += source.sizeBytes
    supplementalSources.push({ index: source, blob: archived.blob })
  }

  if (indexedBytes !== index.totals.sourceBytes) throw new Error('Field bundle source byte total does not match the index.')

  return {
    fileName: file.name,
    construction,
    index,
    archive,
    roleSources,
    supplementalSources,
    verifiedFiles: expectedPaths.length,
  }
}
