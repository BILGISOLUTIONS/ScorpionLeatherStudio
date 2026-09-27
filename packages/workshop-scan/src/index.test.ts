import { describe, expect, it } from 'vitest'
import { encodeWorkshopQr, parseWorkshopScanPayload, workshopQrSvg } from './index'

describe('workshop scan payload', () => {
  const payload = 'SLS:WORKSHOP:1:SC-REQ-ABC123:REV-DEF456'

  it('parses deterministic request and revision identity', () => {
    expect(parseWorkshopScanPayload(payload)).toEqual({
      requestId: 'SC-REQ-ABC123',
      revisionId: 'REV-DEF456',
      payload,
    })
  })

  it('rejects malformed or non-workshop values', () => {
    expect(() => parseWorkshopScanPayload('https://example.com')).toThrow('INVALID_WORKSHOP_SCAN_PAYLOAD')
  })

  it('encodes a version-4 QR matrix with finder patterns', () => {
    const matrix = encodeWorkshopQr(payload)
    expect(matrix).toHaveLength(33)
    expect(matrix.every((row) => row.length === 33)).toBe(true)

    // Finder pattern corners.
    expect(matrix[0][0]).toBe(true)
    expect(matrix[0][6]).toBe(true)
    expect(matrix[6][0]).toBe(true)
    expect(matrix[3][3]).toBe(true)
    expect(matrix[0][26]).toBe(true)
    expect(matrix[26][0]).toBe(true)
  })

  it('renders self-contained SVG without network dependencies', () => {
    const svg = workshopQrSvg(payload, 3)
    expect(svg).toContain('<svg')
    expect(svg).toContain('Workshop QR code')
    expect(svg).toContain('<rect')
    expect(svg).not.toContain('http://api.')
  })
})
