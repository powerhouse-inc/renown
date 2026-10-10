/** Shown by a wallet route when its wallet code failed to download. */
export function WalletLoadError() {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <p className="text-ink text-lg font-semibold">Sign-in could not load</p>
      <p className="text-ink-muted mt-2 text-sm">Check your connection and reload the page.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground hover:bg-primary/80 mt-6 rounded-lg px-5 py-2 text-sm font-semibold transition-colors"
      >
        Reload
      </button>
    </div>
  )
}
