import { describe, expect, it } from 'vitest'
import {
  averageRgb,
  deriveBaseColor,
  deriveNormalMap,
  deriveRoughnessMap,
  rgbToHex,
  type PixelImage,
} from './index'

function solid(r: number, g: number, b: number, size = 2): PixelImage {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = r
    data[index + 1] = g
    data[index + 2] = b
    data[index + 3] = 255
  }
  return { width: size, height: size, data }
}

describe('material processor math', () => {
  it('applies bounded base-color exposure and channel gains', () => {
    const result = deriveBaseColor(solid(100, 120, 140), {
      exposure: 1.1,
      redGain: 1.2,
      greenGain: 1,
      blueGain: 0.8,
    })

    expect([...result.data.slice(0, 4)]).toEqual([132, 132, 123, 255])
  })

  it('produces a flat tangent normal for equal directional frames', () => {
    const frame = solid(128, 128, 128)
    const result = deriveNormalMap(frame, frame, frame, frame)
    const pixel = [...result.data.slice(0, 4)]

    expect(pixel[0]).toBeCloseTo(128, 0)
    expect(pixel[1]).toBeCloseTo(128, 0)
    expect(pixel[2]).toBe(255)
    expect(pixel[3]).toBe(255)
  })

  it('encodes directional differences into tangent normal channels', () => {
    const result = deriveNormalMap(
      solid(128, 128, 128),
      solid(180, 180, 180),
      solid(128, 128, 128),
      solid(80, 80, 80),
      { strength: 2 },
    )

    expect(result.data[0]).toBeLessThan(128)
    expect(result.data[2]).toBeGreaterThan(128)
  })

  it('makes stronger reflective response smoother in the roughness proxy', () => {
    const diffuse = solid(100, 100, 100)
    const lowResponse = deriveRoughnessMap(diffuse, solid(105, 105, 105))
    const highResponse = deriveRoughnessMap(diffuse, solid(180, 180, 180))

    expect(highResponse.data[0]).toBeLessThan(lowResponse.data[0])
  })

  it('summarizes base color for preview metadata', () => {
    expect(averageRgb(solid(138, 78, 43))).toEqual([138, 78, 43])
    expect(rgbToHex([138, 78, 43])).toBe('#8A4E2B')
  })
})
