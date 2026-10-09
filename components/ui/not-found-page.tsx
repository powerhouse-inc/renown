import Head from 'next/head'
import { ErrorState } from '../site/error-state'
import { SiteLayout } from '../site/site-layout'

/** A full-page "not found" (or error) message that search engines skip. */
export function NotFoundPage({ title, message }: { title: string; message: string }) {
  return (
    <SiteLayout>
      <Head>
        <title>{`${title} - Renown`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ErrorState title={title} message={message} />
    </SiteLayout>
  )
}
