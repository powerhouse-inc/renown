/** Longest handle shown in the footer; longer ones are cut with an ellipsis. */
export const FOOTER_HANDLE_MAX = 24

/** The profile card's footer: renown.id/@handle with a long handle shortened, or renown.id without one. */
export function profileFooter(handle: string | null | undefined): string {
  if (!handle) return 'renown.id'
  const shown = handle.length > FOOTER_HANDLE_MAX ? `${handle.slice(0, FOOTER_HANDLE_MAX)}…` : handle
  return `renown.id/@${shown}`
}
