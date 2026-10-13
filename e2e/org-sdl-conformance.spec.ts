import { test, expect } from '@playwright/test'
import { buildSchema, parse, validate } from 'graphql'
import { readFileSync } from 'node:fs'
import { mutationDocument, ORG_MUTATIONS, type OrgMutationName } from '../services/org-mutations'

// Every organisation document renown.id sends must validate against the served SDL.
const schema = buildSchema(readFileSync('e2e/fixtures/sdl-renown-orgs.graphql', 'utf8'))

const SOURCES = ['services/orgs.ts', 'services/org-security.ts'].map((file) => readFileSync(file, 'utf8'))

// ${*_FIELDS} constants from every source, with constants inside constants resolved.
const constants = new Map<string, string>()
for (const source of SOURCES) {
  for (const m of source.matchAll(/(?:export )?const (\w+_FIELDS)\s*=\s*(?:\n\s*)?(['`])((?:(?!\2)[^\\]|\\.)*)\2/g)) constants.set(m[1], m[3])
}
const resolve = (text: string): string => {
  let out = text
  for (let i = 0; i < 4; i++) out = out.replace(/\$\{(\w+_FIELDS)\}/g, (_, n: string) => constants.get(n) ?? `UNRESOLVED_${n}`)
  return out
}

function documentsIn(source: string): string[] {
  return [...source.matchAll(/(['`])\s*(query|mutation) (?:(?!\1)[^\\]|\\.)*\1/g)].map((m) => resolve(m[0].slice(1, -1)))
}

test('every org mutation document validates', () => {
  for (const name of Object.keys(ORG_MUTATIONS) as OrgMutationName[]) {
    expect(validate(schema, parse(mutationDocument(name))).map((e) => e.message), name).toEqual([])
  }
})

test('every org read document validates', async () => {
  let count = 0
  for (const source of SOURCES) {
    for (const doc of documentsIn(source)) {
      if (!/^\s*query /.test(doc)) continue
      expect(doc).not.toContain('UNRESOLVED_')
      expect(validate(schema, parse(doc)).map((e) => e.message), doc.slice(0, 40)).toEqual([])
      count++
    }
  }
  expect(count).toBeGreaterThan(12)
})
