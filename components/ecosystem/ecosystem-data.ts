// The Powerhouse systems Renown works with (homepage strip and /ecosystem).

export interface EcosystemEntry {
  id: 'renown' | 'vetra' | 'achra' | 'connect' | 'switchboard'
  name: string
  /** One-line role. */
  role: string
  /** What it does with identity, for the /ecosystem cards. */
  detail: string
  href: string
}

export const ECOSYSTEM: EcosystemEntry[] = [
  {
    id: 'renown',
    name: 'Renown',
    role: 'Identity, profiles and app stats',
    detail: 'Issues the credentials that let apps act for you, hosts public user and app profiles, and aggregates the stats apps report.',
    href: '/',
  },
  {
    id: 'vetra',
    name: 'Vetra',
    role: 'Build and host environments',
    detail: 'Where builders develop Powerhouse apps and run them in hosted environments. Apps get their Renown identity there.',
    href: 'https://www.vetra.io',
  },
  {
    id: 'achra',
    name: 'Achra',
    role: 'Marketplace, reviews and billing',
    detail: 'The marketplace for Powerhouse apps: listings, user reviews, subscriptions and billing.',
    href: 'https://www.achra.com',
  },
  {
    id: 'connect',
    name: 'Connect',
    role: 'The document app',
    detail: 'The app where people open drives and work on documents. Every change is signed with the key your Renown credential authorised.',
    href: 'https://connect.vetra.io',
  },
  {
    id: 'switchboard',
    name: 'Switchboard',
    role: 'APIs for documents',
    detail: 'The GraphQL and MCP API service for reading and writing documents.',
    href: 'https://academy.vetra.io',
  },
]
