/** This site's public origin: NEXT_PUBLIC_RENOWN_URL, else the request host, else www.renown.id. */
export function siteOrigin(host: string | undefined): string {
  const configured = process.env.NEXT_PUBLIC_RENOWN_URL
  if (configured) return configured.replace(/\/+$/, '')
  return host ? `https://${host}` : 'https://www.renown.id'
}
