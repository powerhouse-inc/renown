// Which service a profile or app link points to, for its icon. Pure. Only
// http(s) URLs are links at all: anything else is dropped by the callers.

export type LinkService = 'github' | 'x' | 'linkedin' | 'farcaster' | 'youtube' | 'discord' | 'telegram' | 'website'

export interface LinkTarget {
  service: LinkService
  /** Hostname without "www.", e.g. "github.com". */
  host: string
}

/** Hostnames (and their subdomains) per service. */
const HOSTS: [LinkService, string[]][] = [
  ['github', ['github.com']],
  ['x', ['x.com', 'twitter.com']],
  ['linkedin', ['linkedin.com', 'lnkd.in']],
  ['farcaster', ['farcaster.xyz', 'warpcast.com']],
  ['youtube', ['youtube.com', 'youtu.be']],
  ['discord', ['discord.com', 'discord.gg', 'discordapp.com']],
  ['telegram', ['t.me', 'telegram.me', 'telegram.org']],
]

/** The service behind `url`, or null when it is not an http(s) URL (such links are never rendered). */
export function linkTarget(url: string): LinkTarget | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  for (const [service, domains] of HOSTS) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return { service, host }
  }
  return { service: 'website', host }
}

/** Display name of a service, for accessible labels ("GitHub"). */
export const SERVICE_NAME: Record<LinkService, string> = {
  github: 'GitHub',
  x: 'X',
  linkedin: 'LinkedIn',
  farcaster: 'Farcaster',
  youtube: 'YouTube',
  discord: 'Discord',
  telegram: 'Telegram',
  website: 'Website',
}
