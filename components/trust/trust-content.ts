// Every claim on /trust, each with the code it was verified against
// (renown-package, renown.id and @renown/sdk 6.2.3). Change a claim only
// together with its source.

const PKG = 'https://github.com/powerhouse-inc/renown-package/blob/main'
const SITE = 'https://github.com/powerhouse-inc/renown/blob/main'
const SDK = 'https://github.com/powerhouse-inc/powerhouse/tree/main/packages/renown'
const SDK_SRC = 'https://github.com/powerhouse-inc/powerhouse/blob/main/packages/renown/src'

export interface TrustClaim {
  id: string
  title: string
  body: string
  source: { label: string; href: string }
  /** A second source, when the claim spans two files. */
  extra?: { label: string; href: string }
}

export const TRUST_CLAIMS: TrustClaim[] = [
  {
    id: 'identity',
    title: 'Your identity is your wallet address',
    body: 'Your Renown DID is did:pkh:eip155:<chain>:<address>, derived from the wallet you sign in with. There is no password: your wallet signs you in.',
    source: { label: 'use-auth-flow.ts', href: `${SITE}/hooks/use-auth-flow.ts` },
  },
  {
    id: 'app-keys',
    title: 'Each app gets its own key, on your device',
    body: 'When you use an app, it generates a P-256 key pair with your browser’s Web Crypto API and keeps it in IndexedDB. That key, not your wallet, signs the app’s requests and document operations.',
    source: { label: 'renown-crypto.ts', href: `${SDK_SRC}/crypto/renown-crypto.ts` },
  },
  {
    id: 'credentials',
    title: 'Apps act for you only with a credential you signed',
    body: 'Approving an app means signing one EIP-712 verifiable credential with your wallet that names the app’s key. It is valid for 7 days by default; an app may ask for anything from 1 to 365 days, and a non-default validity is always shown to you to confirm.',
    source: { label: 'credential-validity.ts', href: `${SITE}/utils/credential-validity.ts` },
  },
  {
    id: 'revocation',
    title: 'You can revoke any credential, and only you can',
    body: 'Revoking requires proof that you are the wallet that issued the credential. The SDK’s SwitchboardClient.getCredential skips revoked credentials and ignores expired ones, so the app’s key stops being accepted on your behalf.',
    source: { label: 'renown-auth/resolvers.ts', href: `${PKG}/subgraphs/renown-auth/resolvers.ts` },
    extra: { label: 'switchboard.ts', href: `${SDK_SRC}/switchboard.ts` },
  },
  {
    id: 'operations',
    title: 'Your work is signed',
    body: 'Each document operation an app submits for you carries a signature over the action, the target document and the signer’s identity, so anyone can check who made a change.',
    source: { label: 'signer.ts', href: `${SDK_SRC}/crypto/signer.ts` },
  },
]

export const STORED: string[] = [
  'Your public profile: display name, handle, bio, links, avatar and the wallet address it belongs to.',
  'The credentials you sign, which are public so that anyone can verify them, including whether they were revoked.',
  'Images you upload, kept in object storage and served through short-lived signed links.',
]

export const NEVER_HELD: string[] = [
  'Your wallet’s private key or seed phrase. Every wallet signature happens in your wallet.',
  'The private keys apps generate on your device.',
  'A password: there is none.',
]

export const OPEN_SOURCE = [
  { label: 'renown-package', detail: 'Credentials, profiles, OIDC, stats (switchboard package)', href: 'https://github.com/powerhouse-inc/renown-package' },
  { label: 'renown.id', detail: 'This website and the sign-in flow', href: 'https://github.com/powerhouse-inc/renown' },
  { label: '@renown/sdk', detail: 'The SDK apps use to sign and verify', href: SDK },
]

export const MEDIA_SOURCE = `${SITE}/services/media.ts`

export const STORAGE_SOURCE = `${PKG}/processors/renown-user/migrations.ts`
