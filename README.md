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

## Analytics

Renown uses [OpenPanel](https://openpanel.dev) (`@openpanel/nextjs`) for product analytics. The
integration is **env-gated and a complete no-op when unconfigured** — if
`NEXT_PUBLIC_OPENPANEL_CLIENT_ID` is empty the SDK script is never loaded and no events are sent.

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
