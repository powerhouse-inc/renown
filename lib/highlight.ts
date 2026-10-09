// Server-only syntax highlighting (getStaticProps / getServerSideProps). Never
// import this from a component: shiki must stay out of the client bundle.
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

export type CodeLang = 'ts' | 'bash' | 'graphql'

/** A code sample ready for <CodeBlock>: the source and its highlighted HTML. */
export interface HighlightedCode {
  code: string
  html: string
}

let highlighter: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark-default.mjs')],
    langs: [import('shiki/langs/typescript.mjs'), import('shiki/langs/bash.mjs'), import('shiki/langs/graphql.mjs')],
    engine: createJavaScriptRegexEngine(),
  })
  return highlighter
}

const LANG: Record<CodeLang, string> = { ts: 'typescript', bash: 'bash', graphql: 'graphql' }

/** Highlights `code` with both site themes (CSS variables --shiki-light / --shiki-dark). */
export async function highlight(code: string, lang: CodeLang): Promise<HighlightedCode> {
  const shiki = await getHighlighter()
  const html = shiki.codeToHtml(code.trim(), {
    lang: LANG[lang],
    themes: { light: 'github-light', dark: 'github-dark-default' },
    defaultColor: false,
  })
  return { code: code.trim(), html }
}

/** Highlights a record of samples in parallel, keeping the keys. */
export async function highlightAll<K extends string>(
  samples: Record<K, { code: string; lang: CodeLang }>,
): Promise<Record<K, HighlightedCode>> {
  const entries = await Promise.all(
    (Object.keys(samples) as K[]).map(async (key) => [key, await highlight(samples[key].code, samples[key].lang)] as const),
  )
  return Object.fromEntries(entries) as Record<K, HighlightedCode>
}
