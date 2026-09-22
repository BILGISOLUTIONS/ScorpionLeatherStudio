import { afterEach, describe, expect, it } from 'vitest'
import { authorizeStaff, isStaffAccessConfigured } from './staff-auth'

afterEach(() => {
  delete process.env.SCORPION_STAFF_TOKEN
})

describe('staff authentication', () => {
  it('is disabled when no server token is configured', () => {
    expect(isStaffAccessConfigured()).toBe(false)
    expect(authorizeStaff({ authorization: 'Bearer anything' })).toBe(false)
  })

  it('accepts only the exact bearer token', () => {
    process.env.SCORPION_STAFF_TOKEN = 'a-long-random-staff-secret-1234567890'
    expect(isStaffAccessConfigured()).toBe(true)
    expect(authorizeStaff({ authorization: 'Bearer a-long-random-staff-secret-1234567890' })).toBe(true)
    expect(authorizeStaff({ authorization: 'Bearer wrong-token' })).toBe(false)
    expect(authorizeStaff({ authorization: 'Basic abc123' })).toBe(false)
  })
})
