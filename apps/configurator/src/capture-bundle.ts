export interface StoredZipEntry {
  path: string
  data: Blob | string | Uint8Array
}

const encoder = new TextEncoder()
const MAX_UINT32 = 0xffffffff

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let value = 0; value < 256; value += 1) {
    let crc = value
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
    }
    table[value] = crc >>> 0
  }
  return table
})()

function cleanPath(value: string): string {
  const segments = value.replaceAll('\\', '/').split('/').filter((segment) => segment && segment !== '.')
  if (!segments.length || segments.some((segment) => segment === '..')) {
    throw new Error('ZIP entry path must be a safe relative path.')
  }
  return segments.join('/')
}

function bytesArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

function asBlob(value: StoredZipEntry['data']): Blob {
  if (value instanceof Blob) return value
  if (typeof value === 'string') return new Blob([value], { type: 'application/octet-stream' })
  return new Blob([bytesArrayBuffer(value)], { type: 'application/octet-stream' })
}

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff
  const reader = blob.stream().getReader()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    for (const byte of chunk.value) {
      crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(1980, Math.min(2107, value.getFullYear()))
  const month = value.getMonth() + 1
  const day = value.getDate()
  const hours = value.getHours()
  const minutes = value.getMinutes()
  const seconds = Math.floor(value.getSeconds() / 2)

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  }
}

function localHeader(args: {
  name: Uint8Array
  crc: number
  size: number
  date: number
  time: number
}): Uint8Array {
  const bytes = new Uint8Array(30 + args.name.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0x0800, true)
  view.setUint16(8, 0, true)
  view.setUint16(10, args.time, true)
  view.setUint16(12, args.date, true)
  view.setUint32(14, args.crc, true)
  view.setUint32(18, args.size, true)
  view.setUint32(22, args.size, true)
  view.setUint16(26, args.name.byteLength, true)
  view.setUint16(28, 0, true)
  bytes.set(args.name, 30)
  return bytes
}

function centralHeader(args: {
  name: Uint8Array
  crc: number
  size: number
  offset: number
  date: number
  time: number
}): Uint8Array {
  const bytes = new Uint8Array(46 + args.name.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0x0800, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, args.time, true)
  view.setUint16(14, args.date, true)
  view.setUint32(16, args.crc, true)
  view.setUint32(20, args.size, true)
  view.setUint32(24, args.size, true)
  view.setUint16(28, args.name.byteLength, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, args.offset, true)
  bytes.set(args.name, 46)
  return bytes
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  if (entryCount > 0xffff) throw new Error('ZIP bundle exceeds the classic ZIP entry-count limit.')
  const bytes = new Uint8Array(22)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, entryCount, true)
  view.setUint16(10, entryCount, true)
  view.setUint32(12, centralSize, true)
  view.setUint32(16, centralOffset, true)
  view.setUint16(20, 0, true)
  return bytes
}

export async function buildStoredZip(entries: readonly StoredZipEntry[], modifiedAt = new Date()): Promise<Blob> {
  if (!entries.length) throw new Error('ZIP bundle requires at least one file.')

  const seen = new Set<string>()
  const prepared: Array<{
    path: string
    name: Uint8Array
    blob: Blob
    crc: number
    size: number
    offset: number
  }> = []

  let localOffset = 0
  for (const entry of entries) {
    const path = cleanPath(entry.path)
    if (seen.has(path)) throw new Error('ZIP bundle contains duplicate path: ' + path)
    seen.add(path)

    const name = encoder.encode(path)
    if (!name.byteLength || name.byteLength > 0xffff) throw new Error('ZIP entry filename is too long.')
    const blob = asBlob(entry.data)
    if (blob.size > MAX_UINT32) throw new Error('ZIP entry exceeds the classic ZIP 4 GB file limit.')
    if (localOffset > MAX_UINT32) throw new Error('ZIP bundle exceeds the classic ZIP 4 GB offset limit.')

    const checksum = await crc32(blob)
    prepared.push({ path, name, blob, crc: checksum, size: blob.size, offset: localOffset })
    localOffset += 30 + name.byteLength + blob.size
  }

  if (localOffset > MAX_UINT32) throw new Error('ZIP bundle exceeds the classic ZIP 4 GB archive limit.')

  const stamp = dosDateTime(modifiedAt)
  const localParts: BlobPart[] = []
  const centralParts: Uint8Array[] = []
  let centralSize = 0

  for (const entry of prepared) {
    localParts.push(bytesArrayBuffer(localHeader({
      name: entry.name,
      crc: entry.crc,
      size: entry.size,
      date: stamp.date,
      time: stamp.time,
    })))
    localParts.push(entry.blob)

    const central = centralHeader({
      name: entry.name,
      crc: entry.crc,
      size: entry.size,
      offset: entry.offset,
      date: stamp.date,
      time: stamp.time,
    })
    centralParts.push(central)
    centralSize += central.byteLength
  }

  if (centralSize > MAX_UINT32) throw new Error('ZIP central directory exceeds the classic ZIP limit.')
  const end = endOfCentralDirectory(prepared.length, centralSize, localOffset)

  return new Blob([
    ...localParts,
    ...centralParts.map(bytesArrayBuffer),
    bytesArrayBuffer(end),
  ], { type: 'application/zip' })
}
