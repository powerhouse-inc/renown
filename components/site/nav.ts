// Every link the site chrome shows, in one place (header, drawer, footer).

export interface NavLink {
  label: string
  href: string
}

export interface FooterColumn {
  title: string
  links: NavLink[]
}

/** Primary navigation (header and mobile drawer). */
export const SITE_NAV: NavLink[] = [
  { label: 'Apps', href: '/apps' },
  { label: 'Developers', href: '/developers' },
  { label: 'Trust', href: '/trust' },
  { label: 'Ecosystem', href: '/ecosystem' },
]

export const PRIVACY_URL = 'https://www.vetra.io/privacy-policy'
export const TERMS_URL = 'https://www.vetra.io/terms-and-conditions'
export const GITHUB_URL = 'https://github.com/powerhouse-inc'
export const X_URL = 'https://x.com/PowerhouseDAO'
export const VETRA_URL = 'https://www.vetra.io'
export const POWERHOUSE_URL = 'https://www.powerhouse.inc'
export const APP_STATS_DOCS_URL = 'https://www.vetra.io/docs/app-stats'

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Apps', href: '/apps' },
      { label: 'Your Renown', href: '/me' },
      { label: 'Trust', href: '/trust' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Developers', href: '/developers' },
      { label: 'App stats docs', href: APP_STATS_DOCS_URL },
      { label: 'GitHub', href: GITHUB_URL },
    ],
  },
  {
    title: 'Ecosystem',
    links: [
      { label: 'Ecosystem', href: '/ecosystem' },
      { label: 'Vetra', href: VETRA_URL },
      { label: 'Powerhouse', href: POWERHOUSE_URL },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: PRIVACY_URL },
      { label: 'Terms', href: TERMS_URL },
    ],
  },
]

/** True when `pathname` is `href` or below it (for aria-current). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href)
}
