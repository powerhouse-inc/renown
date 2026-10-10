import { profileFooter } from '../../lib/og/og-footer'
import { ImageResponse } from 'next/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import { publicOrigin } from '../../utils/seo'
import { loadAppCard, loadProfileCard, type OgBackground, type OgCard } from '../../lib/og/og-data'
import { readFont } from '../../lib/og/og-font'

// Link-preview images: /api/og?variant=default | profile&address=0x… | app&did=did:key:…
// Any lookup or image failure answers with the default card (always 200).
// Node runtime (the pages-router default): images are converted with sharp
// (lib/og/og-image.ts), which the edge runtime cannot load.

const SIZE = { width: 1200, height: 630 }
const INK = '#F4F7FF'
const MUTED = '#94A3B8'
const BG = '#050A1A'
const SIGNAL = '#21FFB4'
const BLUE = '#0080FF'

// A failed font load is not cached (the next request retries) and never fails the route.
let fontsPromise: Promise<[ArrayBuffer, ArrayBuffer]> | null = null
function loadFonts(): Promise<[ArrayBuffer, ArrayBuffer] | null> {
  fontsPromise ??= Promise.all([readFont('Inter-Regular.ttf'), readFont('Inter-SemiBold.ttf')])
  return fontsPromise.catch((error) => {
    console.error('og: font load failed, rendering with the default font:', error)
    fontsPromise = null
    return null
  })
}

function Sparkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 66 66">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={SIGNAL} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <path d="M31.3 1C28.2 12 20 20.6 9.4 23.8c-1.3.4-1.3 2.3 0 2.7C20 29.7 28.2 38.3 31.3 49.3c.4 1.4 2.3 1.4 2.7 0 3.1-11 11.4-19.6 21.9-22.8 1.3-.4 1.3-2.3 0-2.7C45.4 20.6 37.1 12 34 1c-.4-1.4-2.3-1.4-2.7 0Z" fill="url(#g)" />
    </svg>
  )
}

/**
 * Text cut to `lines` lines with an ellipsis; words longer than a line break
 * anywhere. User-provided names, handles and taglines can be any length.
 */
function clamp(lines: number): React.CSSProperties {
  return { display: 'block', lineClamp: lines, overflow: 'hidden', wordBreak: 'break-word' }
}

/**
 * The card's backdrop: the app cover or the identity art, under a scrim that
 * keeps the text legible (darker on the left, where the text sits) and the art
 * dim enough that no backdrop pixel reads as text.
 */
function Backdrop({ background }: { background: OgBackground }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: SIZE.width, height: SIZE.height, display: 'flex' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
      <img src={background.src} width={SIZE.width} height={SIZE.height} alt="" style={{ objectFit: 'cover' }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: SIZE.width,
          height: SIZE.height,
          backgroundImage: 'linear-gradient(90deg, rgba(5,10,26,0.9) 0%, rgba(5,10,26,0.72) 55%, rgba(5,10,26,0.5) 100%)',
        }}
      />
    </div>
  )
}

function Frame({ children, footer, background = null }: { children: React.ReactNode; footer: string; background?: OgBackground | null }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        backgroundColor: BG,
        ...(!background && {
          backgroundImage: `radial-gradient(circle at 85% 10%, rgba(0,128,255,0.35), transparent 45%), radial-gradient(circle at 5% 0%, rgba(33,255,180,0.14), transparent 40%)`,
        }),
        color: INK,
        fontFamily: 'Inter',
      }}
    >
      {background && <Backdrop background={background} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Sparkle size={40} />
        <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>Renown</span>
      </div>
      {children}
      <div style={{ ...clamp(1), whiteSpace: 'nowrap', fontSize: 24, color: MUTED }}>{footer}</div>
    </div>
  )
}

function Monogram({ text, size, radius }: { text: string; size: number; radius: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 600,
        color: INK,
        backgroundImage: `linear-gradient(135deg, ${SIGNAL}, ${BLUE})`,
      }}
    >
      {text.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}

function render(card: OgCard) {
  if (card.variant === 'profile') {
    return (
      <Frame footer={profileFooter(card.handle)} background={card.background}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
            <img src={card.image} width={220} height={220} alt="" style={{ flexShrink: 0, borderRadius: 220, objectFit: 'cover', border: `4px solid ${BLUE}` }} />
          ) : (
            <Monogram text={card.name} size={220} radius={220} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
            <span style={{ ...clamp(2), fontSize: 72, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>{card.name}</span>
            {card.handle && <span style={{ ...clamp(1), fontSize: 34, color: SIGNAL }}>@{card.handle}</span>}
            <span style={{ fontSize: 26, color: MUTED }}>{`${card.address.slice(0, 6)}…${card.address.slice(-4)} on Renown`}</span>
          </div>
        </div>
      </Frame>
    )
  }
  if (card.variant === 'app') {
    return (
      <Frame footer="An app on Renown" background={card.background}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          {card.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
            <img src={card.logo} width={200} height={200} alt="" style={{ flexShrink: 0, borderRadius: 44, objectFit: 'cover' }} />
          ) : (
            <Monogram text={card.name} size={200} radius={44} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>
            {card.category && <span style={{ ...clamp(1), fontSize: 24, color: SIGNAL }}>{card.category}</span>}
            <span style={{ ...clamp(2), fontSize: 72, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>{card.name}</span>
            {card.tagline && <span style={{ ...clamp(2), fontSize: 32, color: MUTED, lineHeight: 1.3 }}>{card.tagline}</span>}
          </div>
        </div>
      </Frame>
    )
  }
  return (
    <Frame footer="www.renown.id">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
        <span style={{ fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02 }}>One identity for the Powerhouse network</span>
        <span style={{ fontSize: 30, color: MUTED }}>Sign in everywhere. Sign your work. Revoke access any time.</span>
      </div>
    </Frame>
  )
}

/** The card to draw; `degraded` when a failure (not a missing profile or image) forced the fallback. */
async function loadCard(url: URL): Promise<{ card: OgCard; degraded: boolean }> {
  const variant = url.searchParams.get('variant')
  try {
    if (variant === 'profile') return { card: (await loadProfileCard(url.searchParams.get('address') ?? '', publicOrigin())) ?? { variant: 'default' }, degraded: false }
    if (variant === 'app') return { card: (await loadAppCard(url.searchParams.get('did') ?? '', publicOrigin())) ?? { variant: 'default' }, degraded: false }
  } catch (error) {
    console.error('og: falling back to the default card:', error)
    return { card: { variant: 'default' }, degraded: true }
  }
  return { card: { variant: 'default' }, degraded: false }
}

// A card drawn after a failure is cached briefly and only by the browser, so a
// transient outage is not pinned at the edge for an hour.
const CACHE_OK = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
const CACHE_DEGRADED = 'public, max-age=60'

/** Whether the card drew the stored image, its monogram, or has no image slot (default card). */
function imageState(card: OgCard): 'drawn' | 'monogram' | 'none' {
  if (card.variant === 'profile') return card.image ? 'drawn' : 'monogram'
  if (card.variant === 'app') return card.logo ? 'drawn' : 'monogram'
  return 'none'
}

async function drawPng(card: OgCard, fonts: [ArrayBuffer, ArrayBuffer] | null): Promise<Buffer> {
  const image = new ImageResponse(render(card), {
    ...SIZE,
    ...(fonts && {
      fonts: [
        { name: 'Inter', data: fonts[0], weight: 400 as const, style: 'normal' as const },
        { name: 'Inter', data: fonts[1], weight: 600 as const, style: 'normal' as const },
      ],
    }),
  })
  return Buffer.from(await image.arrayBuffer())
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only the query matters; the base is a placeholder.
  const url = new URL(req.url ?? '/', 'http://og.invalid')
  let { card, degraded } = await loadCard(url)
  const fonts = await loadFonts()
  let png: Buffer
  try {
    png = await drawPng(card, fonts)
  } catch (error) {
    // Satori refused this card (e.g. an image it cannot lay out): draw the default card instead.
    console.error('og: drawing failed, falling back to the default card:', error)
    card = { variant: 'default' }
    degraded = true
    png = await drawPng(card, fonts)
  }
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', degraded || !fonts ? CACHE_DEGRADED : CACHE_OK)
  res.setHeader('X-Og-Variant', card.variant)
  res.setHeader('X-Og-Image', imageState(card))
  res.setHeader('X-Og-Background', card.variant === 'default' ? 'none' : (card.background?.kind ?? 'none'))
  res.status(200).send(png)
}
