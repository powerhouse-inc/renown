import Head from 'next/head'
import type { ReactNode } from 'react'
import { canonicalUrl, DEFAULT_DESCRIPTION, ogImageUrl, SITE_NAME } from '../../utils/seo'

export interface PageMetaProps {
  /** Page title without the site suffix ("Developers"); omit on the homepage. */
  title?: string
  description?: string
  /** Site path for the canonical URL ("/developers"). Omit for pages that must not be canonicalised. */
  path?: string
  /** Absolute link-preview image; defaults to the generated default card. */
  image?: string
  /** summary_large_image (default) or summary. */
  twitterCard?: 'summary' | 'summary_large_image'
  ogType?: 'website' | 'profile' | 'article'
  /** Adds robots noindex (404, 500, private pages). */
  noindex?: boolean
  /** JSON-LD objects rendered as application/ld+json scripts. */
  jsonLd?: object[]
  /** The whole <title> when it is not "<title> - Renown" (e.g. "Ada (@ada) on Renown"); og/twitter titles still use `title`. */
  documentTitle?: string
  /** Same-origin URL of the page's LCP image (e.g. a cover): preloaded at high priority from <head>. */
  preloadImage?: string | null
  /** Extra head tags (e.g. profile:username). */
  children?: ReactNode
}

/** Every page's <head> SEO block: title, description, canonical, Open Graph, Twitter, JSON-LD. */
export function PageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image = ogImageUrl(),
  twitterCard = 'summary_large_image',
  ogType = 'website',
  noindex = false,
  jsonLd = [],
  documentTitle,
  preloadImage,
  children,
}: PageMetaProps) {
  const fullTitle = documentTitle ? documentTitle : title ? `${title} - ${SITE_NAME}` : `${SITE_NAME} - One identity for the Powerhouse network`
  const url = path ? canonicalUrl(path) : null
  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} key="description" />
      {noindex && <meta name="robots" content="noindex" key="robots" />}
      {url && <link rel="canonical" href={url} key="canonical" />}
      <meta property="og:site_name" content={SITE_NAME} key="og:site_name" />
      <meta property="og:type" content={ogType} key="og:type" />
      <meta property="og:title" content={title ?? SITE_NAME} key="og:title" />
      <meta property="og:description" content={description} key="og:description" />
      {url && <meta property="og:url" content={url} key="og:url" />}
      <meta property="og:image" content={image} key="og:image" />
      <meta name="twitter:card" content={twitterCard} key="twitter:card" />
      <meta name="twitter:title" content={title ?? SITE_NAME} key="twitter:title" />
      <meta name="twitter:description" content={description} key="twitter:description" />
      <meta name="twitter:image" content={image} key="twitter:image" />
      {preloadImage && <link rel="preload" as="image" href={preloadImage} fetchPriority="high" key="preload-lcp-image" />}
      {jsonLd.map((data, index) => (
        <script
          key={`ld-${index}`}
          type="application/ld+json"
          // JSON.stringify output with "<" escaped cannot break out of the script element.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
        />
      ))}
      {children}
    </Head>
  )
}
