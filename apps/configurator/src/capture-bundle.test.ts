import { describe, expect, it } from 'vitest'
import { buildStoredZip } from './capture-bundle'

function occurrences(bytes: Uint8Array, signature: number[]): number {
  let count = 0
  for (let index = 0; index <= bytes.length - signature.length; index += 1) {
    if (signature.every((value, offset) => bytes[index + offset] === value)) count += 1
  }
  return count
}

describe('V0.44 capture ZIP builder', () => {
  it('creates a standards-shaped stored ZIP with UTF-8 filenames and deterministic entries', async () => {
    const zip = await buildStoredZip([
      { path: 'capture-session.json', data: '{"ok":true}\n' },
      { path: 'references/01-front.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
      { path: 'supplemental/001-detail-ü.jpg', data: new Uint8Array([1, 2, 3, 4]) },
    ], new Date('2026-10-03T10:00:00.000Z'))

    expect(zip.type).toBe('application/zip')
    const bytes = new Uint8Array(await zip.arrayBuffer())
    const text = new TextDecoder().decode(bytes)

    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
    expect(occurrences(bytes, [0x50, 0x4b, 0x03, 0x04])).toBe(3)
    expect(occurrences(bytes, [0x50, 0x4b, 0x01, 0x02])).toBe(3)
    expect(occurrences(bytes, [0x50, 0x4b, 0x05, 0x06])).toBe(1)
    expect(text).toContain('capture-session.json')
    expect(text).toContain('references/01-front.jpg')
    expect(text).toContain('supplemental/001-detail-ü.jpg')
    expect(text).toContain('{"ok":true}')
  })

  it('rejects unsafe, duplicate and empty archives', async () => {
    await expect(buildStoredZip([])).rejects.toThrow(/at least one file/u)
    await expect(buildStoredZip([{ path: '../escape.txt', data: 'no' }])).rejects.toThrow(/safe relative path/u)
    await expect(buildStoredZip([
      { path: 'same.txt', data: 'a' },
      { path: './same.txt', data: 'b' },
    ])).rejects.toThrow(/duplicate path/u)
  })
})
