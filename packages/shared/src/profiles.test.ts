import { describe, expect, it } from 'vitest'
import { avatarUrl, initialsFor, normalizeUsername } from './profiles.js'

describe('avatarUrl', () => {
  it('returns null when there is no image', () => {
    expect(avatarUrl({ imageUrl: null }, 32)).toBeNull()
  })

  it('asks the CDN for twice the display size, for retina', () => {
    expect(avatarUrl({ imageUrl: 'https://img.clerk.com/abc' }, 32)).toBe(
      'https://img.clerk.com/abc?width=64',
    )
  })

  it('appends rather than clobbering an existing query string', () => {
    expect(avatarUrl({ imageUrl: 'https://img.clerk.com/abc?v=2' }, 16)).toBe(
      'https://img.clerk.com/abc?v=2&width=32',
    )
  })

  it('caps the size so a caller cannot ask for something absurd', () => {
    expect(avatarUrl({ imageUrl: 'https://img.clerk.com/abc' }, 9999)).toContain('width=512')
  })
})

describe('initialsFor', () => {
  it('uses the first letter of each of the first two words', () => {
    expect(initialsFor({ displayName: 'Ada Lovelace', username: 'ada' })).toBe('AL')
  })

  it('falls back to the username when there is no display name', () => {
    expect(initialsFor({ displayName: '   ', username: 'grace' })).toBe('GR')
  })

  it('never returns empty, because an empty circle reads as a stuck spinner', () => {
    expect(initialsFor({ displayName: '', username: '' })).toBe('?')
  })

  it('handles a single-word name', () => {
    expect(initialsFor({ displayName: 'Ada', username: 'ada' })).toBe('AD')
  })
})

describe('normalizeUsername', () => {
  it('lower-cases and trims, so lookups are case-insensitive', () => {
    expect(normalizeUsername('  AdA  ')).toBe('ada')
  })
})
