import Head from 'next/head'
import PageBackground from './page-background'

/** A full-page "not found" (or error) message that search engines skip. */
export function NotFoundPage({ title, message }: { title: string; message: string }) {
  return (
    <PageBackground>
      <Head>
        <title>{`${title} - Renown`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-foreground mb-2 text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
      </main>
    </PageBackground>
  )
}
