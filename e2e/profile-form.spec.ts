import { test, expect } from '@playwright/test'
import { cropRect, panBy, sourceImageProblem, INITIAL_CROP } from '../utils/image-crop'
import { changedFields, formFromProfile, formProblems, handleFromEns, type ProfileForm } from '../utils/profile-form'

// Runs in the Playwright worker (Node): the editor's pure helpers.
const base: ProfileForm = formFromProfile({
  documentId: 'doc-1',
  displayName: 'Frank',
  handle: 'frank',
  bio: 'Hi',
  links: [{ id: 'l1', label: 'Site', url: 'https://frank.example' }],
  avatar: `attachment://v1:${'a'.repeat(64)}`,
  userImage: null,
})

test.describe('profile form', () => {
  test('signs only what changed, with "" for cleared fields and whole link lists', () => {
    expect(changedFields(base, base)).toEqual({})
    expect(changedFields(base, { ...base, displayName: ' Frank ' })).toEqual({})
    expect(changedFields(base, { ...base, handle: 'Frank-2 ' })).toEqual({ handle: 'frank-2' })
    expect(changedFields(base, { ...base, displayName: '', bio: '', avatar: null })).toEqual({
      displayName: '',
      bio: '',
      avatar: '',
    })
    expect(
      changedFields(base, { ...base, links: [...base.links, { id: 'l2', label: ' Code ', url: 'https://code.example ' }] }),
    ).toEqual({
      links: [
        { id: 'l1', label: 'Site', url: 'https://frank.example' },
        { id: 'l2', label: 'Code', url: 'https://code.example' },
      ],
    })
    expect(changedFields(base, { ...base, avatar: null, userImage: 'https://ens.example/a.png' })).toEqual({
      avatar: '',
      userImage: 'https://ens.example/a.png',
    })
  })

  test('reports the problems the switchboard would refuse', () => {
    expect(formProblems(base)).toEqual({})
    expect(formProblems({ ...base, displayName: 'x'.repeat(65) }).displayName).toMatch(/64/)
    expect(formProblems({ ...base, handle: 'ab' }).handle).toMatch(/3–30/)
    expect(formProblems({ ...base, handle: '' })).toEqual({})
    expect(formProblems({ ...base, bio: 'b'.repeat(281) }).bio).toMatch(/280/)
    expect(formProblems({ ...base, links: [{ id: 'x', label: '', url: 'https://a.example' }] }).links).toMatch(/label/)
    expect(formProblems({ ...base, links: [{ id: 'x', label: 'X', url: 'javascript:alert(1)' }] }).links).toMatch(/https/)
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, label: 'L', url: 'https://a.example' }))
    expect(formProblems({ ...base, links: nine }).links).toMatch(/8/)
  })

  test('suggests a handle from an ENS name only when it is a valid handle', () => {
    expect(handleFromEns('Frank.eth')).toBe('frank')
    expect(handleFromEns('vitalik.eth')).toBe('vitalik')
    expect(handleFromEns('my_name.eth')).toBe('my-name')
    expect(handleFromEns('ab.eth')).toBeNull()
    expect(handleFromEns(null)).toBeNull()
  })
})

test.describe('avatar cropping', () => {
  test('accepts only PNG/JPEG/WebP up to 2 MB', () => {
    expect(sourceImageProblem({ type: 'image/png', size: 2 * 1024 * 1024 })).toBeNull()
    expect(sourceImageProblem({ type: 'image/png', size: 2 * 1024 * 1024 + 1 })).toMatch(/2 MB/)
    expect(sourceImageProblem({ type: 'image/gif', size: 10 })).toMatch(/PNG/)
    expect(sourceImageProblem({ type: 'image/svg+xml', size: 10 })).toMatch(/PNG/)
  })

  test('selects a centred square, zooms in, and never leaves the image when panned', () => {
    expect(cropRect(400, 200, INITIAL_CROP)).toEqual({ sx: 100, sy: 0, size: 200 })
    expect(cropRect(400, 200, { zoom: 2, panX: 0, panY: 0 })).toEqual({ sx: 150, sy: 50, size: 100 })
    expect(cropRect(400, 200, { zoom: 1, panX: -5, panY: 0 })).toEqual({ sx: 0, sy: 0, size: 200 })
    expect(cropRect(400, 200, { zoom: 99, panX: 1, panY: 1 })).toEqual({ sx: 350, sy: 150, size: 50 })
    // Dragging right by the whole viewport moves the crop towards the left edge.
    const panned = panBy(INITIAL_CROP, 400, 200, 240, 240, 0)
    expect(panned.panX).toBe(-1)
    expect(panned.panY).toBe(0) // no vertical slack at zoom 1
  })
})
