import { timingSafeEqual } from 'node:crypto'

type HeaderValue = string | string[] | undefined

function bearerValue(header: HeaderValue): string {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw) return ''
  const match = raw.match(/^Bearer\s+(.+)$/iu)
  return match?.[1]?.trim() ?? ''
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isStaffAccessConfigured(): boolean {
  return Boolean(process.env.SCORPION_STAFF_TOKEN?.trim())
}

export function authorizeStaff(headers: Record<string, HeaderValue>): boolean {
  const expected = process.env.SCORPION_STAFF_TOKEN?.trim()
  if (!expected) return false
  const provided = bearerValue(headers.authorization)
  return Boolean(provided) && safeEqual(provided, expected)
}
