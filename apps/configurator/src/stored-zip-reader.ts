const decoder = new TextDecoder()

export interface StoredZipFile {
  path: string
  blob: Blob
  size: number
  crc32: number
}

export interface StoredZipArchive {
  files: Map<string, StoredZipFile>
  totalUncompressedBytes: number
}

function safePath(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//iu.test(normalized)) {
    throw new Error('ZIP contains an unsafe absolute path.')
  }
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('ZIP contains an unsafe relative path.')
  }
  return parts.join('/')
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let value = 0; value < 256; value += 1) {
    let crc = value
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
    }
    table[value] = crc >>> 0
  }
  return table
}

const CRC_TABLE = crcTable()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export async function readStoredZip(blob: Blob): Promise<StoredZipArchive> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const files = new Map<string, StoredZipFile>()
  let offset = 0
  let total = 0

  while (offset + 4 <= bytes.byteLength) {
    const signature = view.getUint32(offset, true)
    if (signature === 0x02014b50 || signature === 0x06054b50) break
    if (signature !== 0x04034b50) throw new Error('ZIP local-file structure is invalid.')
    if (offset + 30 > bytes.byteLength) throw new Error('ZIP local header is truncated.')

    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const expectedCrc = view.getUint32(offset + 14, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const uncompressedSize = view.getUint32(offset + 22, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)

    if ((flags & 0x0008) !== 0) throw new Error('ZIP data descriptors are not supported by SLS field-bundle intake.')
    if (method !== 0) throw new Error('ZIP contains compressed entries. SLS field bundles must use store mode.')
    if (compressedSize !== uncompressedSize) throw new Error('Stored ZIP entry size contract is invalid.')

    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    const dataStart = nameEnd + extraLength
    const dataEnd = dataStart + uncompressedSize
    if (nameEnd > bytes.byteLength || dataEnd > bytes.byteLength) throw new Error('ZIP entry is truncated.')

    const path = safePath(decoder.decode(bytes.subarray(nameStart, nameEnd)))
    if (files.has(path)) throw new Error('ZIP contains duplicate path: ' + path)

    const data = bytes.subarray(dataStart, dataEnd)
    const actualCrc = crc32(data)
    if (actualCrc !== expectedCrc) throw new Error('ZIP CRC mismatch: ' + path)

    const entryBytes = new Uint8Array(data.byteLength)
    entryBytes.set(data)
    files.set(path, {
      path,
      blob: new Blob([entryBytes.buffer], { type: 'application/octet-stream' }),
      size: entryBytes.byteLength,
      crc32: actualCrc,
    })
    total += entryBytes.byteLength
    offset = dataEnd
  }

  if (!files.size) throw new Error('ZIP does not contain any local files.')
  return { files, totalUncompressedBytes: total }
}
