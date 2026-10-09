import Image from 'next/image'
import type { ReactNode } from 'react'
import LandingGradient from '../../assets/images/landing-gradient.jpg'
import Noise from '../../assets/images/noise.png'
import PhIconsBackground from '../ui/ph-icons-background'
import RenownLogo from '../ui/renown-logo'
import ThemeToggle from '../ui/theme-toggle'
import { SiteBackdrop } from './site-backdrop'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

export type SiteLayoutVariant = 'site' | 'auth'

export interface SiteLayoutProps {
  children: ReactNode
  /** site: header + main + footer. auth: the minimal sign-in chrome (logo + theme toggle only). */
  variant?: SiteLayoutVariant
}

/** The page frame every route renders inside. Pages render their content only (no <main>). */
export function SiteLayout({ children, variant = 'site' }: SiteLayoutProps) {
  if (variant === 'auth') {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="absolute top-0 bottom-0 z-0 hidden w-screen overflow-hidden fill-[#404040] dark:block">
          <Image priority src={LandingGradient} alt="" className="absolute z-0 h-full w-[101vw] max-w-none object-cover" />
          <Image priority src={Noise} alt="" className="absolute z-0 h-full w-[101vw] max-w-none object-cover" />
        </div>
        <div className="pointer-events-none absolute top-0 bottom-0 z-0 w-screen overflow-hidden">
          <PhIconsBackground aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0" />
        </div>
        <div className="absolute top-3 left-8 z-10 flex items-center gap-4">
          <RenownLogo role="img" aria-label="Renown" />
        </div>
        <div className="absolute top-3 right-8 z-10 flex items-center gap-3">
          <ThemeToggle />
        </div>
        <main id="main">{children}</main>
      </div>
    )
  }
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <a
        href="#main"
        className="bg-primary-strong text-primary-foreground sr-only z-50 rounded-full px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteBackdrop />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
