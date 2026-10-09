import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { loadAppCard, loadProfileCard, type OgCard } from '../../lib/og/og-data'

// Link-preview images: /api/og?variant=default | profile&address=0x… | app&did=did:key:…
// Any lookup or image failure answers with the default card (always 200).
export const config = { runtime: 'edge' }

const SIZE = { width: 1200, height: 630 }
const INK = '#F4F7FF'
const MUTED = '#94A3B8'
const BG = '#050A1A'
const SIGNAL = '#21FFB4'
const BLUE = '#0080FF'

const fonts = Promise.all([
  fetch(new URL('../../assets/fonts/Inter-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
  fetch(new URL('../../assets/fonts/Inter-SemiBold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
])

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

function Frame({ children, footer }: { children: React.ReactNode; footer: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        backgroundColor: BG,
        backgroundImage: `radial-gradient(circle at 85% 10%, rgba(0,128,255,0.35), transparent 45%), radial-gradient(circle at 5% 0%, rgba(33,255,180,0.14), transparent 40%)`,
        color: INK,
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Sparkle size={40} />
        <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>Renown</span>
      </div>
      {children}
      <div style={{ display: 'flex', fontSize: 24, color: MUTED }}>{footer}</div>
    </div>
  )
}

function Monogram({ text, size, radius }: { text: string; size: number; radius: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
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
      <Frame footer={card.handle ? `renown.id/@${card.handle}` : 'renown.id'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
            <img src={card.image} width={220} height={220} alt="" style={{ borderRadius: 220, objectFit: 'cover', border: `4px solid ${BLUE}` }} />
          ) : (
            <Monogram text={card.name} size={220} radius={220} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            <span style={{ fontSize: 72, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>{card.name}</span>
            {card.handle && <span style={{ fontSize: 34, color: SIGNAL }}>@{card.handle}</span>}
            <span style={{ fontSize: 26, color: MUTED }}>{`${card.address.slice(0, 6)}…${card.address.slice(-4)} on Renown`}</span>
          </div>
        </div>
      </Frame>
    )
  }
  if (card.variant === 'app') {
    return (
      <Frame footer="An app on Renown">
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          {card.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
            <img src={card.logo} width={200} height={200} alt="" style={{ borderRadius: 44, objectFit: 'cover' }} />
          ) : (
            <Monogram text={card.name} size={200} radius={44} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
            {card.category && <span style={{ fontSize: 24, color: SIGNAL }}>{card.category}</span>}
            <span style={{ fontSize: 72, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>{card.name}</span>
            {card.tagline && <span style={{ fontSize: 32, color: MUTED, lineHeight: 1.3 }}>{card.tagline}</span>}
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

async function loadCard(url: URL): Promise<OgCard> {
  const variant = url.searchParams.get('variant')
  try {
    if (variant === 'profile') return (await loadProfileCard(url.searchParams.get('address') ?? '', url.origin)) ?? { variant: 'default' }
    if (variant === 'app') return (await loadAppCard(url.searchParams.get('did') ?? '', url.origin)) ?? { variant: 'default' }
  } catch (error) {
    console.error('og: falling back to the default card:', error)
  }
  return { variant: 'default' }
}

export default async function handler(req: NextRequest) {
  const url = new URL(req.url)
  const card = await loadCard(url)
  const [regular, semibold] = await fonts
  return new ImageResponse(render(card), {
    ...SIZE,
    fonts: [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
    ],
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'X-Og-Variant': card.variant,
    },
  })
}
