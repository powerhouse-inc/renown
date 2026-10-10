import discord from '@iconify-icons/simple-icons/discord'
import github from '@iconify-icons/simple-icons/github'
import linkedin from '@iconify-icons/simple-icons/linkedin'
import telegram from '@iconify-icons/simple-icons/telegram'
import x from '@iconify-icons/simple-icons/x'
import youtube from '@iconify-icons/simple-icons/youtube'
import globe from '@iconify-icons/lucide/globe'
import type { LinkService } from '../../utils/link-service'

// Icon bodies are static SVG markup shipped with the iconify packages (no user data).
const FARCASTER =
  '<path fill="currentColor" d="M4 3h16v3h-1.5v12H20v3h-6.5v-3h1.5v-6a3 3 0 0 0-6 0v6h1.5v3H4v-3h1.5V6H4z"/>'
const BODY: Record<LinkService, string> = {
  github: github.body,
  x: x.body,
  linkedin: linkedin.body,
  farcaster: FARCASTER,
  youtube: youtube.body,
  discord: discord.body,
  telegram: telegram.body,
  website: globe.body,
}

/** A 16 px service glyph in the current text colour; decorative. */
export function ServiceIcon({ service, className = 'h-4 w-4' }: { service: LinkService; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={className}
      // Trusted: iconify's bundled icon markup, never user input.
      dangerouslySetInnerHTML={{ __html: BODY[service] }}
    />
  )
}
