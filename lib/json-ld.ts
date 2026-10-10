// schema.org JSON-LD for the public profile and app pages. Pure; rendered by
// PageMeta (which escapes "<"). Only public, already-shown facts; descriptions
// are plain text (markdown syntax stripped).
import type { RenownAppProfile } from '../services/app-profiles'
import type { RenownProfile } from '../services/switchboard'
import { linkTarget } from '../utils/link-service'
import { clipText, markdownPlainText } from '../utils/markdown-lite'

function safeUrls(links: readonly { url: string }[] | undefined): string[] {
  return (links ?? []).filter((link) => linkTarget(link.url)).map((link) => link.url)
}

export interface ProfileJsonLdInput {
  profile: RenownProfile
  name: string
  /** Absolute canonical URL of the profile page. */
  url: string
  /** Absolute avatar URL (/media), when the profile has an uploaded avatar. */
  image: string | null
  /** did:pkh of the wallet, when there is one. */
  did: string | null
}

/** ProfilePage whose main entity is the Person. */
export function profileJsonLd({ profile, name, url, image, did }: ProfileJsonLdInput): object {
  const sameAs = safeUrls(profile.links)
  const description = markdownPlainText(profile.bio ?? '')
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    ...(profile.createdAt && { dateCreated: profile.createdAt }),
    ...(profile.updatedAt && { dateModified: profile.updatedAt }),
    mainEntity: {
      '@type': 'Person',
      name,
      url,
      ...(profile.handle && { alternateName: `@${profile.handle}` }),
      ...(did && { identifier: did }),
      ...(description && { description }),
      ...(image && { image }),
      ...(sameAs.length > 0 && { sameAs }),
    },
  }
}

export interface AppJsonLdInput {
  app: RenownAppProfile
  name: string
  url: string
  image: string | null
  /** The publisher's name and profile URL, when known. */
  publisher: { name: string; url: string } | null
}

/** SoftwareApplication for an app page. */
export function appJsonLd({ app, name, url, image, publisher }: AppJsonLdInput): object {
  const sameAs = safeUrls(app.links)
  const website = app.website && linkTarget(app.website) ? app.website : null
  const description = clipText(app.tagline ?? '') || markdownPlainText(app.description ?? '')
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    url,
    identifier: app.appDid,
    ...(description && { description }),
    ...(app.category && { applicationCategory: app.category }),
    ...(image && { image }),
    ...(website && { installUrl: website }),
    ...(sameAs.length > 0 && { sameAs }),
    ...(publisher && { publisher: { '@type': 'Person', name: publisher.name, url: publisher.url } }),
  }
}
