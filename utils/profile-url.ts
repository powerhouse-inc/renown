/** A profile's canonical path: /@handle when it has one, else /profile/<documentId>. */
export function profilePath(profile: { handle?: string | null; documentId: string }): string {
  return profile.handle ? `/@${profile.handle}` : `/profile/${encodeURIComponent(profile.documentId)}`
}
