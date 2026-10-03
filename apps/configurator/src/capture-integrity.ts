import type { CapturedReferenceFrame } from '@sls/product-capture'

export interface HashedLocalFile {
  file: File
  sha256: string
}

function bytesArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

export function isSha256Hex(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

export async function sha256Hex(value: Blob | string | Uint8Array): Promise<string> {
  const input = value instanceof Blob
    ? await value.arrayBuffer()
    : typeof value === 'string'
      ? new TextEncoder().encode(value).buffer
      : bytesArrayBuffer(value)

  const digest = await crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashFilesSequentially(
  files: readonly File[],
  onProgress?: (completed: number, total: number, file: File) => void,
): Promise<HashedLocalFile[]> {
  const results: HashedLocalFile[] = []
  for (const file of files) {
    results.push({ file, sha256: await sha256Hex(file) })
    onProgress?.(results.length, files.length, file)
  }
  return results
}

function legacyMetadataMatch(expected: CapturedReferenceFrame, candidate: HashedLocalFile): boolean {
  if (expected.name !== candidate.file.name || expected.size !== candidate.file.size) return false
  if (expected.lastModified > 0 && candidate.file.lastModified > 0) {
    return expected.lastModified === candidate.file.lastModified
  }
  return true
}

export function verifyReattachedReference(
  expected: CapturedReferenceFrame,
  candidate: HashedLocalFile,
): CapturedReferenceFrame {
  if (isSha256Hex(expected.sha256)) {
    if (candidate.sha256 !== expected.sha256) {
      throw new Error('Selected file does not match the original SHA-256 fingerprint.')
    }
    return expected
  }

  if (!legacyMetadataMatch(expected, candidate)) {
    throw new Error('Legacy capture metadata does not match the selected filename/size/timestamp.')
  }

  return { ...expected, sha256: candidate.sha256 }
}

export function reconcileReattachedReferenceSet(
  expected: readonly CapturedReferenceFrame[],
  candidates: readonly HashedLocalFile[],
): { files: File[]; frames: CapturedReferenceFrame[] } {
  if (expected.length !== candidates.length) {
    throw new Error('Reattachment count does not match the saved supplemental evidence set.')
  }

  const unused = candidates.map((candidate, index) => ({ candidate, index, used: false }))
  const orderedFiles: File[] = []
  const upgradedFrames: CapturedReferenceFrame[] = []

  for (const frame of expected) {
    let match = isSha256Hex(frame.sha256)
      ? unused.find((entry) => !entry.used && entry.candidate.sha256 === frame.sha256)
      : unused.find((entry) => !entry.used && legacyMetadataMatch(frame, entry.candidate))

    if (!match) {
      const identity = isSha256Hex(frame.sha256)
        ? frame.sha256.slice(0, 12) + '…'
        : frame.name
      throw new Error('Could not match saved supplemental evidence: ' + identity)
    }

    match.used = true
    orderedFiles.push(match.candidate.file)
    upgradedFrames.push(isSha256Hex(frame.sha256) ? frame : { ...frame, sha256: match.candidate.sha256 })
  }

  return { files: orderedFiles, frames: upgradedFrames }
}
