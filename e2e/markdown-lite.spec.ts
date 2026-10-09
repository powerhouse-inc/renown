import { test, expect } from '@playwright/test'
import { parseMarkdownLite, safeHref } from '../utils/markdown-lite'

// Runs in the Playwright worker (Node): the description parser behind /app/<did>.
const text = (t: string) => ({ type: 'text', text: t })

test.describe('markdown-lite', () => {
  test('parses headings, paragraphs with line breaks, lists and quotes', () => {
    expect(
      parseMarkdownLite('# Title\n\nLine one\nline two\n\n- a\n* **b**\n\n1. one\n2) two\n\n> quoted\n> more\n### Small'),
    ).toEqual([
      { type: 'heading', level: 1, children: [text('Title')] },
      { type: 'paragraph', children: [text('Line one'), { type: 'break' }, text('line two')] },
      { type: 'list', ordered: false, items: [[text('a')], [{ type: 'strong', children: [text('b')] }]] },
      { type: 'list', ordered: true, items: [[text('one')], [text('two')]] },
      { type: 'quote', children: [text('quoted'), { type: 'break' }, text('more')] },
      { type: 'heading', level: 3, children: [text('Small')] },
    ])
  })

  test('parses inline code, emphasis and safe links only', () => {
    expect(
      parseMarkdownLite(
        'Use `npm i` with *care*, _really_. [Docs](https://docs.example/a) [x](javascript:void0) [m](mailto:a@b.example)',
      ),
    ).toEqual([
      {
        type: 'paragraph',
        children: [
          text('Use '),
          { type: 'code', text: 'npm i' },
          text(' with '),
          { type: 'em', children: [text('care')] },
          text(', '),
          { type: 'em', children: [text('really')] },
          text('. '),
          { type: 'link', href: 'https://docs.example/a', children: [text('Docs')] },
          text(' '),
          text('x'),
          text(' '),
          { type: 'link', href: 'mailto:a@b.example', children: [text('m')] },
        ],
      },
    ])
  })

  test('never turns script-ish input into anything but text', () => {
    expect(parseMarkdownLite('<script>alert(1)</script>\n[e](javascript:alert(1))')).toEqual([
      { type: 'paragraph', children: [text('<script>alert(1)</script>'), { type: 'break' }, text('[e](javascript:alert(1))')] },
    ])
    expect(parseMarkdownLite('')).toEqual([])
    expect(parseMarkdownLite('\r\n\r\n  \n')).toEqual([])
  })

  test('safeHref allows http(s) and mailto only', () => {
    expect(safeHref('https://a.example')).toBe('https://a.example/')
    expect(safeHref('http://a.example/x')).toBe('http://a.example/x')
    expect(safeHref('mailto:x@y.example')).toBe('mailto:x@y.example')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,hi')).toBeNull()
    expect(safeHref('/relative')).toBeNull()
  })
})
