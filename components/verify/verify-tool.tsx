import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectInput, KIND_NAMES, PROBLEM_TEXT } from '../../lib/verify/detect'
import { VERIFY_EXAMPLES } from '../../lib/verify/examples'
import { liveDeps, runVerify } from '../../lib/verify/run'
import { readShareFragment, shareFragment } from '../../lib/verify/share'
import type { Report } from '../../lib/verify/types'
import { cx } from '../../utils/cx'
import { buttonClasses } from '../site/primitives'
import { VerifyReport } from './verify-report'

type Result =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; report: Report; shareUrl: string | null }
  | { status: 'failed' }

const fieldClass =
  'border-hairline-strong bg-surface-1 text-ink placeholder:text-ink-muted focus:border-primary/60 h-11 w-full rounded-[10px] border px-3 font-mono text-[13px] outline-none transition-colors'

/** /verify's paste box, its live detection and the result of a check. */
export function VerifyTool() {
  const [text, setText] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [branch, setBranch] = useState('main')
  const [result, setResult] = useState<Result>({ status: 'idle' })
  const [missingDocument, setMissingDocument] = useState(false)
  const request = useRef(0)
  const detected = useMemo(() => detectInput(text), [text])
  const isOperation = detected.kind === 'operation'

  const check = useCallback(async (input: { text: string; documentId: string; branch: string }) => {
    const found = detectInput(input.text)
    if (found.kind === null) return
    if (found.kind === 'operation' && !input.documentId.trim()) {
      setMissingDocument(true)
      return
    }
    const id = ++request.current
    setResult({ status: 'checking' })
    try {
      const report = await runVerify(found, { documentId: input.documentId, branch: input.branch || 'main' }, liveDeps())
      if (id !== request.current) return
      // null when the paste is too long to carry in a link.
      const fragment = shareFragment(input)
      const shareUrl = fragment === null ? null : `${window.location.origin}/verify${fragment}`
      setResult({ status: 'done', report, shareUrl })
    } catch (error) {
      console.error('Verify failed:', error)
      if (id === request.current) setResult({ status: 'failed' })
    }
  }, [])

  /** Shows `input` in the form and checks it (examples, share links). */
  const load = useCallback(
    (input: { text: string; documentId: string; branch: string }) => {
      setText(input.text)
      setDocumentId(input.documentId)
      setBranch(input.branch)
      setMissingDocument(false)
      void check(input)
    },
    [check],
  )

  // A share link: check what it carries, and take it out of the address bar
  // once the router is ready (Next re-applies the URL on hydration), so
  // nothing records it (components/analytics waits for that).
  const router = useRouter()
  const restored = useRef(false)
  useEffect(() => {
    if (!router.isReady || restored.current) return
    restored.current = true
    const shared = readShareFragment(window.location.hash)
    if (!shared) return
    void router.replace({ pathname: router.pathname }, undefined, { shallow: true, scroll: false })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment only exists in the browser, read once after hydration
    load(shared)
  }, [router, load])

  function edit(update: () => void) {
    update()
    request.current++
    setMissingDocument(false)
    if (result.status !== 'idle') setResult({ status: 'idle' })
  }

  const hint =
    detected.kind !== null
      ? { tone: 'ok', text: `Looks like ${KIND_NAMES[detected.kind]}.` }
      : detected.problem === 'empty'
        ? { tone: 'muted', text: 'Signatures are checked here, in your browser.' }
        : { tone: 'warn', text: PROBLEM_TEXT[detected.problem] }
  const busy = result.status === 'checking'

  return (
    <div>
      <form
        className="border-hairline-strong bg-code rounded-panel shadow-card overflow-hidden border"
        onSubmit={(event) => {
          event.preventDefault()
          void check({ text, documentId, branch })
        }}
      >
        <label htmlFor="verify-input" className="sr-only">
          Paste a DID, credential, token or signed operation
        </label>
        <textarea
          id="verify-input"
          value={text}
          onChange={(event) => edit(() => setText(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void check({ text, documentId, branch })
            }
          }}
          rows={8}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-describedby="verify-hint"
          placeholder="Paste a DID, credential, token or signed operation"
          className="text-ink placeholder:text-ink-muted block min-h-48 w-full resize-y bg-transparent p-5 font-mono text-[13px] leading-6 outline-none md:p-6"
        />
        {isOperation && (
          <div className="border-hairline grid gap-4 border-t px-5 py-4 sm:grid-cols-[minmax(0,1fr)_200px] md:px-6">
            <div>
              <label htmlFor="verify-document" className="text-ink text-sm font-semibold">
                Document ID
              </label>
              <input
                id="verify-document"
                value={documentId}
                onChange={(event) => edit(() => setDocumentId(event.target.value))}
                aria-required="true"
                aria-invalid={missingDocument}
                aria-describedby={missingDocument ? 'verify-document-error' : 'verify-document-hint'}
                spellCheck={false}
                autoComplete="off"
                className={cx(fieldClass, 'mt-1.5', missingDocument && 'border-danger-ink')}
              />
              {missingDocument ? (
                <p id="verify-document-error" role="alert" className="text-danger-ink mt-1.5 text-xs">
                  Enter the id of the document this operation belongs to.
                </p>
              ) : (
                <p id="verify-document-hint" className="text-ink-muted mt-1.5 text-xs">
                  A v2 signature covers the document and branch it was made for.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="verify-branch" className="text-ink text-sm font-semibold">
                Branch
              </label>
              <input
                id="verify-branch"
                value={branch}
                onChange={(event) => edit(() => setBranch(event.target.value))}
                spellCheck={false}
                autoComplete="off"
                className={cx(fieldClass, 'mt-1.5')}
              />
            </div>
          </div>
        )}
        <div className="border-hairline flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p id="verify-hint" className="flex min-w-0 items-start gap-2 text-sm" aria-live="polite">
            <span
              aria-hidden="true"
              className={cx(
                'mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full',
                hint.tone === 'ok' ? 'bg-signal' : hint.tone === 'warn' ? 'bg-caution-ink' : 'bg-ink-muted/60',
              )}
            />
            <span className={hint.tone === 'warn' ? 'text-caution-ink' : 'text-ink-muted'}>{hint.text}</span>
          </p>
          <button type="submit" disabled={detected.kind === null || busy} className={buttonClasses('primary', 'md', 'shrink-0 px-6')}>
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-ink-muted mr-1 text-sm">Try an example:</span>
        {VERIFY_EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            onClick={() => load({ text: example.text, documentId: example.documentId, branch: 'main' })}
            className="border-hairline bg-surface-1 text-ink hover:border-primary/50 hover:bg-surface-2 h-8 rounded-full border px-3 text-sm font-medium transition-colors"
          >
            {example.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" aria-busy={busy}>
        {result.status === 'checking' && <p className="text-ink-muted mt-10 text-sm">Checking signatures…</p>}
        {result.status === 'failed' && (
          <p role="alert" className="text-danger-ink mt-10">
            The check stopped unexpectedly. Reload the page and try again.
          </p>
        )}
        {result.status === 'done' && <VerifyReport report={result.report} shareUrl={result.shareUrl} />}
      </div>
    </div>
  )
}
