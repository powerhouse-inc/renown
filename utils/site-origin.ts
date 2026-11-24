import { runtimeConfig } from '../lib/runtime-config'
/** This site's public origin: the deployment's Renown URL, else the request host, else www.renown.id. */
export function siteOrigin(host: string | undefined): string {
  const configured = runtimeConfig().renownUrl
  if (configured) return configured.replace(/\/+$/, '')
  return host ? `https://${host}` : 'https://www.renown.id'
}
