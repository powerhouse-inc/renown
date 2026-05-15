# auth-providers

Concrete login adapters that plug into the auth orchestrator in
`services/wallet/`. Each provider directory is self-contained and exposes
the following pieces:

- **`adapter.ts`** — a class that extends `BaseWalletAdapter` and
  implements the `WalletAdapter` interface (`login`, `logout`,
  `getSession`, `subscribe`). This is the framework-agnostic core.
- **`bridge.tsx`** — a small React component that captures the
  framework-only hooks (RainbowKit's `useConnectModal`, Privy's
  `usePrivy`, etc.) and wires them imperatively into the adapter
  instance it receives as a prop. Mounted by the provider below.
- **`provider.tsx`** — the React provider wrapper for the SDK
  (`<WagmiProvider>`, `<PrivyProvider>`, …). It mounts the bridge for
  its adapter and renders `children` so consumers can nest underneath.
- **`module.tsx`** — exports an `AuthProviderModule` (the
  self-describing contract defined in `services/wallet/module.ts`)
  containing `name`, an `enabled` flag, a `createAdapter()` factory,
  and the `Provider` component.
- **`index.ts`** — re-exports the adapter, bridge, and module.

The composition root is `services/wallet/setup.ts`. It imports each
provider's `module`, filters by `module.enabled`, calls
`createAdapter()` on the survivors, and registers the resulting
adapters with the `AdapterRegistry` used by the `AuthOrchestrator`.
`services/wallet/auth-root-provider.tsx` then nests every active
module's `Provider` automatically at the app root.

## Adding a new provider

1. Create `auth-providers/<name>/`.
2. Implement `adapter.ts` by extending `BaseWalletAdapter`. Declare
   the `LoginMethod` values it supports via `supportedMethods`.
3. If the SDK needs React hooks at runtime, add `bridge.tsx` that
   `bind`s those hooks into the adapter via an imperative setter
   (see `privy/bridge.tsx` for the pattern).
4. Add `provider.tsx` exposing a component
   `({ adapter, children }) => ReactNode` that wraps the SDK provider
   and mounts the bridge.
5. Add `module.tsx` exporting an `AuthProviderModule` with the
   provider's `name`, `enabled` decision (typically derived from env
   config), `createAdapter`, and `Provider`.
6. Re-export from `index.ts`.
7. Add the module to the `allModules` array in
   `services/wallet/setup.ts`. No changes to `AuthRootProvider` are
   needed — it iterates `activeProviderTree` and nests the providers
   for every enabled module.
8. Document required env vars in a `README.md` next to the adapter.

## Providers

- [`wagmi`](./wagmi) — EOA wallets via wagmi + RainbowKit
  (`LoginMethod.WALLET`). Always enabled.
- [`privy`](./privy) — embedded wallet via Privy social/email/SMS
  (`LoginMethod.GOOGLE`, `EMAIL`, …). Enabled when
  `NEXT_PUBLIC_PRIVY_APP_ID` is set; otherwise the module is filtered
  out and neither its adapter nor its React provider are mounted.
