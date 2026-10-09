// Font bytes for the link-preview route (pages/api/og.tsx). A non-OK answer
// throws, so the route degrades to the default font instead of handing satori
// an error page as a font.
export async function fetchFont(url: URL, fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Font ${response.status}`)
  return response.arrayBuffer()
}
