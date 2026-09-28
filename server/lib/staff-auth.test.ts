import { afterEach, describe, expect, it } from 'vitest'
import {
  authenticateStaff,
  authorizeStaff,
  isStaffAccessConfigured,
  publicStaffIdentity,
  resolveStaffActor,
  staffHasRole,
} from './staff-auth'

afterEach(() => {
  delete process.env.SCORPION_STAFF_TOKEN
  delete process.env.SCORPION_STAFF_IDENTITIES_JSON
})

describe('staff authentication', () => {
  it('is disabled when no server staff access is configured', () => {
    expect(isStaffAccessConfigured()).toBe(false)
    expect(authorizeStaff({ authorization: 'Bearer anything' })).toBe(false)
    expect(authenticateStaff({ authorization: 'Bearer anything' })).toBeNull()
  })

  it('accepts the legacy shared token as an admin fallback', () => {
    process.env.SCORPION_STAFF_TOKEN = 'a-long-random-staff-secret-1234567890'
    const identity = authenticateStaff({
      authorization: 'Bearer a-long-random-staff-secret-1234567890',
    })

    expect(identity).toEqual({
      id: 'legacy-shared',
      name: 'Legacy shared access',
      roles: ['admin'],
      legacy: true,
    })
    expect(authorizeStaff({ authorization: 'Bearer wrong-token' })).toBe(false)
    expect(authorizeStaff({ authorization: 'Basic abc123' })).toBe(false)
    expect(resolveStaffActor(identity!, 'Manual Legacy Name')).toBe('Manual Legacy Name')
  })

  it('authenticates individual staff tokens without exposing the token', () => {
    process.env.SCORPION_STAFF_IDENTITIES_JSON = JSON.stringify([
      {
        id: 'ray',
        name: 'Ray',
        token: 'ray-individual-secret-token-123456',
        roles: ['sales', 'workshop'],
      },
      {
        id: 'wilson',
        name: 'Wilson',
        token: 'wilson-individual-secret-token-123',
        roles: ['qc'],
      },
    ])

    const ray = authenticateStaff({
      authorization: 'Bearer ray-individual-secret-token-123456',
    })
    expect(ray).toEqual({
      id: 'ray',
      name: 'Ray',
      roles: ['sales', 'workshop'],
      legacy: false,
    })
    expect(publicStaffIdentity(ray!)).not.toHaveProperty('token')
    expect(staffHasRole(ray!, 'sales')).toBe(true)
    expect(staffHasRole(ray!, 'qc')).toBe(false)
    expect(resolveStaffActor(ray!, 'Spoofed Name')).toBe('Ray')

    const wilson = authenticateStaff({
      authorization: 'Bearer wilson-individual-secret-token-123',
    })
    expect(wilson?.name).toBe('Wilson')
    expect(staffHasRole(wilson!, 'qc')).toBe(true)
  })

  it('gives admin identities all staff permissions', () => {
    process.env.SCORPION_STAFF_IDENTITIES_JSON = JSON.stringify([
      {
        id: 'owner',
        name: 'Owner',
        token: 'owner-admin-secret-token-12345678',
        roles: ['admin'],
      },
    ])
    const owner = authenticateStaff({
      authorization: 'Bearer owner-admin-secret-token-12345678',
    })

    expect(staffHasRole(owner!, 'viewer')).toBe(true)
    expect(staffHasRole(owner!, 'sales')).toBe(true)
    expect(staffHasRole(owner!, 'workshop')).toBe(true)
    expect(staffHasRole(owner!, 'qc')).toBe(true)
  })

  it('ignores malformed or duplicate identity records rather than weakening auth', () => {
    process.env.SCORPION_STAFF_IDENTITIES_JSON = JSON.stringify([
      { id: 'x', name: 'Too short id', token: 'valid-length-token-1234567890', roles: ['admin'] },
      { id: 'valid-user', name: 'Valid User', token: 'valid-user-token-123456789012', roles: ['viewer', 'unknown'] },
      { id: 'valid-user', name: 'Duplicate', token: 'duplicate-token-1234567890123', roles: ['admin'] },
      { id: 'other-user', name: 'Duplicate token', token: 'valid-user-token-123456789012', roles: ['admin'] },
      { id: 'no-roles', name: 'No Roles', token: 'no-roles-token-1234567890123456', roles: [] },
    ])

    expect(isStaffAccessConfigured()).toBe(true)
    expect(authenticateStaff({
      authorization: 'Bearer valid-user-token-123456789012',
    })).toMatchObject({
      id: 'valid-user',
      roles: ['viewer'],
    })
    expect(authenticateStaff({
      authorization: 'Bearer duplicate-token-1234567890123',
    })).toBeNull()
  })
})
