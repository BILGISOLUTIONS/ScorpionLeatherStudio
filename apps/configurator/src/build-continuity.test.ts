import { describe, expect, it, vi } from 'vitest'
import { copyStudioBuildLink, distributeStudioBuildLink } from './build-continuity'

describe('build continuity sharing', () => {
  it('uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }

    await expect(distributeStudioBuildLink('https://example.com/build', { share, clipboard })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({
      title: 'Scorpion Leather Studio build',
      text: 'Continue this Scorpion Western Wear custom build.',
      url: 'https://example.com/build',
    })
    expect(clipboard.writeText).not.toHaveBeenCalled()
  })

  it('falls back to clipboard when native sharing is unavailable or fails', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    await expect(distributeStudioBuildLink('https://example.com/build', { clipboard })).resolves.toBe('copied')

    const share = vi.fn().mockRejectedValue(new Error('share unavailable'))
    await expect(distributeStudioBuildLink('https://example.com/build', { share, clipboard })).resolves.toBe('copied')
    expect(clipboard.writeText).toHaveBeenCalled()
  })

  it('does not turn an intentional share cancellation into a clipboard side effect', async () => {
    const cancelled = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    await expect(distributeStudioBuildLink('https://example.com/build', {
      share: vi.fn().mockRejectedValue(cancelled),
      clipboard,
    })).resolves.toBe('cancelled')
    expect(clipboard.writeText).not.toHaveBeenCalled()
  })

  it('reports clipboard availability precisely', async () => {
    await expect(copyStudioBuildLink('https://example.com/build', {})).resolves.toBe(false)
    await expect(copyStudioBuildLink('https://example.com/build', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })).resolves.toBe(true)
  })
})
