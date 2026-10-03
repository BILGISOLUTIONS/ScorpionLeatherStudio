import { describe, expect, it } from 'vitest'
import type { CapturedReferenceFrame } from '@sls/product-capture'
import {
  hashFilesSequentially,
  reconcileReattachedReferenceSet,
  sha256Hex,
  verifyReattachedReference,
} from './capture-integrity'

function frame(name: string, size: number, lastModified: number, sha256?: string): CapturedReferenceFrame {
  return {
    name,
    size,
    type: 'image/jpeg',
    lastModified,
    kind: 'supplemental-reference',
    sha256,
  }
}

describe('V0.45 capture evidence integrity', () => {
  it('produces stable SHA-256 fingerprints', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex(new Uint8Array([97, 98, 99]))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes files sequentially and reports bounded progress', async () => {
    const files = [
      new File(['alpha'], 'a.jpg', { type: 'image/jpeg', lastModified: 10 }),
      new File(['beta'], 'b.jpg', { type: 'image/jpeg', lastModified: 20 }),
    ]
    const progress: string[] = []
    const hashed = await hashFilesSequentially(files, (completed, total, file) => {
      progress.push(completed + '/' + total + ':' + file.name)
    })

    expect(hashed).toHaveLength(2)
    expect(hashed[0]?.sha256).toHaveLength(64)
    expect(hashed[0]?.sha256).not.toBe(hashed[1]?.sha256)
    expect(progress).toEqual(['1/2:a.jpg', '2/2:b.jpg'])
  })

  it('rejects a different reattachment when an original fingerprint exists', async () => {
    const original = new File(['original'], 'front.jpg', { type: 'image/jpeg', lastModified: 1 })
    const replacement = new File(['different'], 'front.jpg', { type: 'image/jpeg', lastModified: 1 })
    const originalHash = await sha256Hex(original)
    const replacementHash = await sha256Hex(replacement)

    expect(() => verifyReattachedReference(
      frame('front.jpg', original.size, 1, originalHash),
      { file: replacement, sha256: replacementHash },
    )).toThrow(/does not match the original SHA-256/u)
  })

  it('upgrades legacy metadata only when basic file metadata still matches', async () => {
    const file = new File(['legacy'], 'legacy.jpg', { type: 'image/jpeg', lastModified: 123 })
    const digest = await sha256Hex(file)
    const upgraded = verifyReattachedReference(
      frame('legacy.jpg', file.size, 123),
      { file, sha256: digest },
    )
    expect(upgraded.sha256).toBe(digest)

    expect(() => verifyReattachedReference(
      frame('other.jpg', file.size, 123),
      { file, sha256: digest },
    )).toThrow(/Legacy capture metadata/u)
  })

  it('reattaches a supplemental set by fingerprint rather than picker order', async () => {
    const first = new File(['one'], 'one.jpg', { type: 'image/jpeg', lastModified: 1 })
    const second = new File(['two'], 'two.jpg', { type: 'image/jpeg', lastModified: 2 })
    const firstHash = await sha256Hex(first)
    const secondHash = await sha256Hex(second)

    const result = reconcileReattachedReferenceSet(
      [
        frame('one.jpg', first.size, 1, firstHash),
        frame('two.jpg', second.size, 2, secondHash),
      ],
      [
        { file: second, sha256: secondHash },
        { file: first, sha256: firstHash },
      ],
    )

    expect(result.files.map((file) => file.name)).toEqual(['one.jpg', 'two.jpg'])
    expect(result.frames.map((entry) => entry.sha256)).toEqual([firstHash, secondHash])
  })
})
