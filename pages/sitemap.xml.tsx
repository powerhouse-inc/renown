import type { GetServerSideProps } from 'next'
import { collectAppDids, renderSitemap } from '../lib/sitemap'
import { listAppProfiles } from '../services/app-profiles'
import { publicOrigin } from '../utils/seo'
import { withTimeout } from '../utils/with-timeout'

/** Overall budget for paging through app profiles. */
const SITEMAP_TIMEOUT_MS = 8000

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const dids = await withTimeout(collectAppDids(listAppProfiles), SITEMAP_TIMEOUT_MS).catch((error: unknown) => {
    console.error('sitemap: app profiles timed out:', error)
    return []
  })
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.write(renderSitemap(publicOrigin(), dids))
  res.end()
  return { props: {} }
}

export default function Sitemap() {
  return null
}
