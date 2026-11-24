# Powerhouse Renown

![app](./.github/app.png)

## Decentralized identity + reputation hub

- Create a pseudonymous contributor identity, tethered to your Ethereum address. Build up reputation points in various professional fields by successfully delivering projects.
- Share your pseudonymous profile as a resume with organizations you want to work for.
- Define gamification rewards to incentivize value-aligned behavior within the organization, reducing the need for a management hierarchy

## Getting Started

### Prerequisites

- Install [**Node (LTS)**](https://nodejs.org/en/download/)
- Clone this repository
- Install [pnpm](https://pnpm.io/): `npm install -g pnpm`
- Run `pnpm install` or `npm install` to install dependencies

First, run the development server:

```bash
npm run dev
# OR
pnpm dev

```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

Copy `.env.example` to `.env.local` and fill in the values for the features you need (wallet
connect, Privy, analytics, etc.).

## Settings at start

One image serves any Renown deployment: the settings below, given to the server when it starts,
win over the `NEXT_PUBLIC_*` values baked into the build. An unset or empty setting keeps the
baked value, so a deployment that sets none (renown.id's) runs exactly as built. The server reads
them from its environment; the browser gets the same values from `/api/runtime-config`, which
`pages/_document.tsx` loads before the app starts (`lib/runtime-config.ts`). Only public values
travel this way.

| Setting at start | Overrides (baked) | What |
|---|---|---|
| `RENOWN_URL` | `NEXT_PUBLIC_RENOWN_URL` | This Renown's public origin |
| `SWITCHBOARD_ENDPOINT` | `NEXT_PUBLIC_SWITCHBOARD_ENDPOINT` | The switchboard's GraphQL endpoint |
| `RENOWN_OIDC_ISSUER` | `NEXT_PUBLIC_RENOWN_OIDC_ISSUER` | The OIDC issuer apps configure |
| `CONNECT_URL` | `NEXT_PUBLIC_CONNECT_URL` | Where a sign-in with nowhere else to return to goes |
| `PRIVY_APP_ID` | `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app (email and social sign-in) |
| `PRIVY_CLIENT_ID` | `NEXT_PUBLIC_PRIVY_CLIENT_ID` | Privy app client |
| `WALLET_CONNECT_PROJECT_ID` | `NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID` | WalletConnect project |
| `INFURA_PROJECT_ID` | `NEXT_PUBLIC_VITE_INFURA_PROJECT_ID` | Infura project: the wallets' RPC and smart-wallet checks |
| `OPENPANEL_CLIENT_ID` | `NEXT_PUBLIC_OPENPANEL_CLIENT_ID` | OpenPanel client (analytics) |
| `OPENPANEL_API_URL` | `NEXT_PUBLIC_OPENPANEL_API_URL` | OpenPanel API |
| `RENOWN_DRIVE_ID` | `NEXT_PUBLIC_RENOWN_DRIVE_ID` | The drive profiles live in (default `renown-profiles`) |
| `RENOWN_ANALYTICS` | none | `off` loads neither OpenPanel nor Umami; anything else leaves them on |

Two pairs resolve together: when `PRIVY_APP_ID` is given at start, `PRIVY_CLIENT_ID` comes from
the start too (none when not given), never from the build, whose client belongs to another app.
Likewise `OPENPANEL_API_URL` follows `OPENPANEL_CLIENT_ID`.

Known limit: pages prerendered at build (404, 500, admin/reports, developers, ecosystem, me,
notifications, org/new, trust, verify) carry the build's origin in their canonical and
link-preview tags; the browser rewrites them after it loads, but crawlers and link unfurlers see
the build's. Rendering those pages per request (`getServerSideProps`) would change that, at the
cost of static rendering.

Read a setting through `runtimeConfig()` from `lib/runtime-config.ts`, never as
`process.env.NEXT_PUBLIC_*`: a direct read keeps the build's value whatever the deployment sets
(`e2e/runtime-config-readers.spec.ts` fails on one).

## Server-side organisation reads

Server-only variables (never prefixed `NEXT_PUBLIC_`):

- `RENOWN_TRUSTED_READ_TOKEN`: sent as `X-Renown-Read-Token` with SSR reads to renown-orgs,
  together with the visitor's address as `X-Renown-Client-IP`, so the switchboard rate-limits
  per visitor rather than per renown.id server.
- `RENOWN_TRUST_VERCEL_HEADERS`: set to `1` only on Vercel (www.renown.id), where the platform
  sets `x-vercel-forwarded-for`. Leave it unset on the self-hosted (k8s) images: there a visitor
  could send that header. Without it the visitor address comes from `x-real-ip` (the ingress
  overwrites it), then the last `x-forwarded-for` hop, then the socket.

## Analytics

Renown uses [OpenPanel](https://openpanel.dev) (`@openpanel/nextjs`) for product analytics. The
integration is **env-gated and a complete no-op when unconfigured** — with no OpenPanel client
id (`OPENPANEL_CLIENT_ID` at start, else `NEXT_PUBLIC_OPENPANEL_CLIENT_ID`), or with
`RENOWN_ANALYTICS=off`, the SDK script is never loaded and no events are sent. Umami, loaded by
`/api/runtime-config`, follows `RENOWN_ANALYTICS` too.

### Configuration

Add to `.env.local`:

```sh
NEXT_PUBLIC_OPENPANEL_CLIENT_ID=""   # enables analytics when set
NEXT_PUBLIC_OPENPANEL_API_URL=""     # optional; blank = OpenPanel cloud
```

When enabled, OpenPanel automatically tracks pageviews and outgoing-link clicks. A user is
identified by their wallet address on connect and cleared on disconnect. Every event carries an
`app: renown` global property so Renown's data is distinguishable from sibling Powerhouse products
in the shared dashboard.

### Architecture

The integration lives in two places:

- `services/analytics/` — the abstraction layer. `events.ts` is the **single source of truth for
  event names** (`ANALYTICS_EVENTS`), and `use-analytics.ts` exposes a fail-safe `useAnalytics()`
  hook (`{ track, identify, clear }`) that wraps OpenPanel. Every SDK call is wrapped in try/catch:
  analytics must never break the app.
- `components/analytics/` — `analytics.tsx` mounts `<OpenPanelComponent>` (gated on the client ID)
  and `analytics-identity.tsx` drives identify/clear from the wallet session. Mounted once in
  `pages/_app.tsx`.

### Contract for contributors

- Call sites use `useAnalytics()` from `services/analytics` — **never import the SDK directly.**
- Add any new event name to `ANALYTICS_EVENTS` in `services/analytics/events.ts`; don't pass raw
  strings to `track()`.
- Keep payloads small and free of secrets — never send JWTs/credentials.

### Tracked events

| Event | When |
|---|---|
| `login.method.selected` | A login method button is clicked (`{ method }`) |
| `login.cancelled` | User dismisses the login flow |
| `login.failed` | Login throws a non-cancellation error |
| `authorization.confirm.clicked` | "Confirm Authorization" / "Authorize CLI" clicked |
| `credential.revoked` | A credential is successfully revoked |
| `credential.verified` | A credential is verified (`{ valid }`) |
| `console.authorization.completed` | CLI session handshake (`PUT`) succeeds |
| `console.authorization.failed` | CLI session handshake fails |
| `app.return.clicked` | "Return to app" button clicked |
| `auth.sign.out` | User disconnects |

## Learn More

To learn more about this stack, take a look at the following resources:

- [RainbowKit Documentation](https://rainbowkit.com) - Learn how to customize your wallet connection flow.
- [wagmi Documentation](https://wagmi.sh) - Learn how to interact with Ethereum.
- [Next.js Documentation](https://nextjs.org/docs) - Learn how to build a Next.js application.

You can check out [the RainbowKit GitHub repository](https://github.com/rainbow-me/rainbowkit) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
