import { timingSafeEqual } from 'node:crypto'

type HeaderValue = string | string[] | undefined

export type StaffRole = 'viewer' | 'sales' | 'workshop' | 'qc' | 'admin'

export interface StaffIdentity {
  id: string
  name: string
  roles: StaffRole[]
  legacy: boolean
}

export interface PublicStaffIdentity {
  id: string
  name: string
  roles: StaffRole[]
  legacy: boolean
}

interface ConfiguredStaffIdentity extends StaffIdentity {
  token: string
}

const ALLOWED_ROLES = new Set<StaffRole>(['viewer', 'sales', 'workshop', 'qc', 'admin'])
const MAX_IDENTITIES = 32
const MAX_CONFIG_BYTES = 16 * 1024

let cachedRaw = ''
let cachedLegacy = ''
let cachedIdentities: ConfiguredStaffIdentity[] = []

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

function normalizeRoles(value: unknown): StaffRole[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((role): role is StaffRole => typeof role === 'string' && ALLOWED_ROLES.has(role as StaffRole)),
  )]
}

function parseConfiguredIdentities(raw: string): ConfiguredStaffIdentity[] {
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_CONFIG_BYTES) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const identities: ConfiguredStaffIdentity[] = []
  const ids = new Set<string>()
  const tokens = new Set<string>()

  for (const candidate of parsed.slice(0, MAX_IDENTITIES)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const record = candidate as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim().toLowerCase() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const token = typeof record.token === 'string' ? record.token.trim() : ''
    const roles = normalizeRoles(record.roles)

    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/u.test(id)) continue
    if (!name || name.length > 120) continue
    if (token.length < 24 || token.length > 256) continue
    if (!roles.length) continue
    if (ids.has(id) || tokens.has(token)) continue

    ids.add(id)
    tokens.add(token)
    identities.push({ id, name, token, roles, legacy: false })
  }

  return identities
}

function configuredIdentities(): ConfiguredStaffIdentity[] {
  const raw = process.env.SCORPION_STAFF_IDENTITIES_JSON?.trim() ?? ''
  const legacy = process.env.SCORPION_STAFF_TOKEN?.trim() ?? ''
  if (raw === cachedRaw && legacy === cachedLegacy) return cachedIdentities

  cachedRaw = raw
  cachedLegacy = legacy
  cachedIdentities = parseConfiguredIdentities(raw)

  if (legacy && !cachedIdentities.some((identity) => safeEqual(identity.token, legacy))) {
    cachedIdentities.push({
      id: 'legacy-shared',
      name: 'Legacy shared access',
      token: legacy,
      roles: ['admin'],
      legacy: true,
    })
  }

  return cachedIdentities
}

export function isStaffAccessConfigured(): boolean {
  return configuredIdentities().length > 0
}

export function authenticateStaff(headers: Record<string, HeaderValue>): StaffIdentity | null {
  const provided = bearerValue(headers.authorization)
  if (!provided) return null

  let matched: ConfiguredStaffIdentity | null = null
  for (const identity of configuredIdentities()) {
    if (safeEqual(provided, identity.token)) matched = identity
  }
  if (!matched) return null

  return {
    id: matched.id,
    name: matched.name,
    roles: [...matched.roles],
    legacy: matched.legacy,
  }
}

export function authorizeStaff(headers: Record<string, HeaderValue>): boolean {
  return Boolean(authenticateStaff(headers))
}

export function staffHasRole(identity: StaffIdentity, ...roles: StaffRole[]): boolean {
  if (identity.roles.includes('admin')) return true
  return roles.some((role) => identity.roles.includes(role))
}

export function resolveStaffActor(identity: StaffIdentity, requestedActor = ''): string {
  return identity.legacy ? requestedActor.trim() : identity.name
}

export function publicStaffIdentity(identity: StaffIdentity): PublicStaffIdentity {
  return {
    id: identity.id,
    name: identity.name,
    roles: [...identity.roles],
    legacy: identity.legacy,
  }
}
