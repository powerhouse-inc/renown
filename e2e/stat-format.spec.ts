import { test, expect } from '@playwright/test'
import type { UserStatEntry } from '../services/app-stats'
import { formatStatDate, formatStatValue, groupUserStats } from '../utils/stat-format'

// Runs in the Playwright worker (Node): formatting and grouping behind the stats UI.
const entry = (appDid: string, metric: string, extra: Partial<UserStatEntry> = {}): UserStatEntry => ({
  appDid,
  metric,
  value: 1,
  updatedAt: '2026-10-09T00:00:00.000Z',
  appName: 'Vault',
  appDocumentId: 'doc-vault',
  appHasLogo: false,
  appLogoRef: null,
  appLogo: null,
  label: metric,
  unit: null,
  ...extra,
})

test('formats stat values compactly and dates in UTC', () => {
  expect(formatStatValue(0)).toBe('0')
  expect(formatStatValue(-3)).toBe('-3')
  expect(formatStatValue(0.125)).toBe('0.13')
  expect(formatStatValue(1234)).toBe('1,234')
  expect(formatStatValue(12500)).toBe('12.5K')
  expect(formatStatValue(1234567)).toBe('1.2M')
  expect(formatStatDate('2026-10-09T23:30:00.000Z')).toBe('Oct 9, 2026')
})

test('groups declared stats by app, in first-seen order, dropping undeclared metrics', () => {
  const groups = groupUserStats([
    entry('did:a', 'notes'),
    entry('did:b', 'streak', { appName: null }),
    entry('did:a', 'raw', { label: null }),
    entry('did:a', 'score'),
    entry('did:c', 'x', { appDocumentId: null }),
  ])
  expect(groups.map((g) => [g.appDid, g.appName, g.entries.map((e) => e.metric)])).toEqual([
    ['did:a', 'Vault', ['notes', 'score']],
    ['did:b', 'Untitled app', ['streak']],
  ])
  // An app whose stats are all undeclared shows no group.
  expect(groupUserStats([entry('did:d', 'raw', { label: null })])).toEqual([])
})
