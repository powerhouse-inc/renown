#!/usr/bin/env node
// Fails the build when a marketing page's client chunks contain wallet code.
//
// Marketing pages must not download the wallet stack (Privy, wagmi, RainbowKit,
// WalletConnect/Reown): only the wallet routes load it, through
// components/wallet/lazy-wallet-shell.tsx. This reads .next/build-manifest.json
// (the JS/CSS each page loads up front) after `next build` and searches those
// files for strings only the wallet libraries contain. It also checks the
// markers still occur in the build's other chunks, so a library upgrade that
// renames them cannot turn this check into a silent pass.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NEXT_DIR = process.argv[2] ?? '.next'

const MARKETING_PAGES = ['/', '/apps', '/developers', '/trust', '/ecosystem', '/app/[did]', '/profile/[id]', '/404', '/500']

/** Library → strings found in its bundled code and in no Renown code. */
const WALLET_MARKERS = {
  privy: ['auth.privy.io', '@privy-io'],
  walletconnect: ['walletconnect'],
  rainbowkit: ['rainbowkit', '[data-rk]'],
  wagmi: ['wagmi'],
  reown: ['@reown'],
}

function read(file) {
  return readFileSync(join(NEXT_DIR, file), 'utf8')
}

/** The libraries whose markers occur in `text`. */
function walletLibrariesIn(text) {
  return Object.entries(WALLET_MARKERS)
    .filter(([, markers]) => markers.some((marker) => text.includes(marker)))
    .map(([library]) => library)
}

function main() {
  const manifest = JSON.parse(read('build-manifest.json'))
  const problems = []
  for (const page of MARKETING_PAGES) {
    const files = manifest.pages[page]
    if (!files) {
      problems.push(`${page}: not in build-manifest.json (renamed? update MARKETING_PAGES)`)
      continue
    }
    for (const file of new Set([...manifest.pages['/_app'], ...files])) {
      if (!file.endsWith('.js') && !file.endsWith('.css')) continue
      const found = walletLibrariesIn(read(file))
      if (found.length) problems.push(`${page}: ${file} contains ${found.join(', ')}`)
    }
  }
  // Positive control: every marker set must still match some chunk of this build.
  const chunksDir = join(NEXT_DIR, 'static', 'chunks')
  const all = readdirSync(chunksDir, { recursive: true })
    .filter((file) => String(file).endsWith('.js'))
    .map((file) => readFileSync(join(chunksDir, String(file)), 'utf8'))
    .join('\n')
  const present = walletLibrariesIn(all)
  for (const library of Object.keys(WALLET_MARKERS)) {
    if (!present.includes(library)) {
      problems.push(`no chunk contains a ${library} marker: update WALLET_MARKERS.${library}`)
    }
  }
  if (problems.length) {
    console.error('Wallet code check failed:\n  ' + problems.join('\n  '))
    process.exit(1)
  }
  console.log(`Wallet code check passed: ${MARKETING_PAGES.length} marketing pages load no wallet code.`)
}

main()
