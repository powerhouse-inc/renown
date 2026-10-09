import type { ReactNode } from 'react'
import { Heading, Lead, Section } from '../site/primitives'

interface Pillar {
  title: string
  body: ReactNode
  icon: string
}

const PILLARS: Pillar[] = [
  {
    title: 'Sign in everywhere',
    body: 'Powerhouse apps like Connect accept the same Renown ID. You approve each app once, and there is no password to reuse or leak.',
    icon: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  },
  {
    title: 'Provable authorship',
    body: 'Every change you make to a Powerhouse document is signed by a key you authorised, so anyone can check it came from your DID.',
    icon: 'M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6zM9 12l2 2 4-4',
  },
  {
    title: 'Your public profile',
    body: (
      <>
        Claim a handle at <span className="text-ink font-mono text-[0.92em]">renown.id/@you</span> with a name, avatar,
        bio and links, and list the apps you publish.
      </>
    ),
    icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  },
]

export function Pillars() {
  return (
    <Section labelledBy="pillars-title">
      <div className="max-w-[720px]">
        <Heading level={2} id="pillars-title">
          An identity that travels with you
        </Heading>
        <Lead>One sign-in, one signature, one profile, recognised across the network.</Lead>
      </div>
      <ul className="border-hairline mt-14 grid border-t md:grid-cols-3">
        {PILLARS.map((pillar, index) => (
          <li
            key={pillar.title}
            className={`border-hairline py-8 md:px-8 md:py-10 ${index > 0 ? 'border-t md:border-t-0 md:border-l' : 'md:pl-0'}`}
          >
            <span className="bg-primary/10 text-primary-ink ring-primary/20 flex h-11 w-11 items-center justify-center rounded-xl ring-1">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={pillar.icon} />
              </svg>
            </span>
            <h3 className="text-ink text-h3 mt-6">{pillar.title}</h3>
            <p className="text-ink-muted mt-3 leading-7">{pillar.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
