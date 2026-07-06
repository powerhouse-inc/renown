## <small>1.12.2 (2026-07-06)</small>

* fix(auth): keep return-to-host button on one line ([8e8d4e7](https://github.com/powerhouse-inc/renown/commit/8e8d4e7))

## <small>1.12.1 (2026-07-02)</small>

* fix(api): preserve graceful degradation while keeping perf ([5abc58c](https://github.com/powerhouse-inc/renown/commit/5abc58c))
* perf(api): cut GraphQL round-trips in login routes ([0a51c42](https://github.com/powerhouse-inc/renown/commit/0a51c42))

## 1.12.0 (2026-06-29)

* feat: update RenownLogo component for Vetra variant (#2783) ([0529263](https://github.com/powerhouse-inc/renown/commit/0529263)), closes [#2783](https://github.com/powerhouse-inc/renown/issues/2783)

## 1.11.0 (2026-06-15)

* feat: hide topbar login button during auth confirm flows ([8a44f62](https://github.com/powerhouse-inc/renown/commit/8a44f62))

## <small>1.10.3 (2026-06-15)</small>

* fix: return stored eip712 domain directly in credential api response ([f6f1385](https://github.com/powerhouse-inc/renown/commit/f6f1385))

## <small>1.10.2 (2026-06-03)</small>

* fix: pin @faker-js/faker to 8.4.1 (CJS) to stop Vercel runtime crash ([8de4e74](https://github.com/powerhouse-inc/renown/commit/8de4e74))

## <small>1.10.1 (2026-06-03)</small>

* fix: declare packageManager pnpm@10.1.0 (fix Vercel build) ([a2d5870](https://github.com/powerhouse-inc/renown/commit/a2d5870))
* fix: move pnpm overrides into pnpm-workspace.yaml ([d94654b](https://github.com/powerhouse-inc/renown/commit/d94654b))
* fix: update dockerfile to include NEXT_PUBLIC vars ([5e7e7b5](https://github.com/powerhouse-inc/renown/commit/5e7e7b5))
* fix: valid pnpm-workspace.yaml (unblock CI + Vercel builds) ([1093180](https://github.com/powerhouse-inc/renown/commit/1093180))
* ci: pass OpenPanel NEXT_PUBLIC build-args to the image build ([8a910df](https://github.com/powerhouse-inc/renown/commit/8a910df))
* chore: attaching all the data we have in indent ([15c5119](https://github.com/powerhouse-inc/renown/commit/15c5119))
* chore: slimming comments ([0dee3b9](https://github.com/powerhouse-inc/renown/commit/0dee3b9))
* refactor: renaming a few things to line up with other projects, also steal the initial page landing  ([6c51671](https://github.com/powerhouse-inc/renown/commit/6c51671))
* initial openpanel implementation ([94a2f04](https://github.com/powerhouse-inc/renown/commit/94a2f04))

## 1.10.0 (2026-05-19)

* feat(auth): add loading and pre-login components for improved user experience during authentication ([5e5ab68](https://github.com/powerhouse-inc/renown/commit/5e5ab68))
* feat(auth): add Privy authentication provider and integrate with wallet adapter ([a270357](https://github.com/powerhouse-inc/renown/commit/a270357))
* feat(auth): enhance Privy authentication flow with provisioning state and loading indicators ([2d2b709](https://github.com/powerhouse-inc/renown/commit/2d2b709))
* feat(auth): implement console flow components for enhanced CLI authorization experience ([9abb19f](https://github.com/powerhouse-inc/renown/commit/9abb19f))
* feat(auth): implement last used login method tracking in login buttons ([1614d4f](https://github.com/powerhouse-inc/renown/commit/1614d4f))
* feat(auth): improve auto-sign functionality and manage revoked addresses in web flow ([0df2870](https://github.com/powerhouse-inc/renown/commit/0df2870))
* feat(auth): introduce useAuthFlow hook for streamlined authorization state management and UI renderi ([09c5761](https://github.com/powerhouse-inc/renown/commit/09c5761))
* feat(auth): update authorization messages for clarity in console and web flows ([fcd2433](https://github.com/powerhouse-inc/renown/commit/fcd2433))
* feat(styles): add cursor pointer for links and buttons to enhance user interaction ([c248ea4](https://github.com/powerhouse-inc/renown/commit/c248ea4))
* feat(wallet): enhance wallet adapter and orchestrator with session management and state subscription ([38085d0](https://github.com/powerhouse-inc/renown/commit/38085d0))
* fix(auth): update loading messages for authorization and revocation actions ([db335de](https://github.com/powerhouse-inc/renown/commit/db335de))

## <small>1.9.2 (2026-05-13)</small>

* fix: profile page on Vercel environment ([1cccc67](https://github.com/powerhouse-inc/renown/commit/1cccc67))

## <small>1.9.1 (2026-05-13)</small>

* fix(profile): transpile @rainbow-me/rainbowkit for Vercel SSR ([d592472](https://github.com/powerhouse-inc/renown/commit/d592472))
* Merge branch 'main' of https://github.com/powerhouse-inc/renown ([69bc857](https://github.com/powerhouse-inc/renown/commit/69bc857))
* chore: update TypeScript routes import and specify Node.js engine version in package.json ([2aa1b1d](https://github.com/powerhouse-inc/renown/commit/2aa1b1d))

## 1.9.0 (2026-05-13)

* Merge branch 'main' into chore/upgrade-deps ([93532bb](https://github.com/powerhouse-inc/renown/commit/93532bb))
* feat: integrate next-themes for theme management to avoid theme flickering ([aa3cc62](https://github.com/powerhouse-inc/renown/commit/aa3cc62))
* fix: lint issues after migration to react 19 ([ddbb3cc](https://github.com/powerhouse-inc/renown/commit/ddbb3cc))
* fix: normalize Ethereum address format in profile API ([ee03581](https://github.com/powerhouse-inc/renown/commit/ee03581))
* chore: add ESLint and Next.js configuration files, update TypeScript settings, and modify package de ([1e13bf3](https://github.com/powerhouse-inc/renown/commit/1e13bf3))
* chore: upgrade tailwind and fix light mode theme ([e90da3e](https://github.com/powerhouse-inc/renown/commit/e90da3e))
* chore: upgrade tailwind and fix light mode theme ([176d9f4](https://github.com/powerhouse-inc/renown/commit/176d9f4))
* refactor: update Renown integration and dependencies ([3808ab3](https://github.com/powerhouse-inc/renown/commit/3808ab3))

## <small>1.8.2 (2026-05-06)</small>

* fix: improve light-mode contrast on profile view ([ab4b05c](https://github.com/powerhouse-inc/renown/commit/ab4b05c)), closes [#2502](https://github.com/powerhouse-inc/renown/issues/2502)

## <small>1.8.1 (2026-04-29)</small>

* chore: remove unused files, deps, and exports flagged by knip ([5f16ad1](https://github.com/powerhouse-inc/renown/commit/5f16ad1))
* fix: improve credential lookup and session rehydration ([38e2220](https://github.com/powerhouse-inc/renown/commit/38e2220))

## 1.8.0 (2026-04-29)

* feat: simplify wallet integration ([5d14305](https://github.com/powerhouse-inc/renown/commit/5d14305))

## <small>1.7.2 (2026-04-29)</small>

* fix: resolve document id when revoking credential ([2a1a7d2](https://github.com/powerhouse-inc/renown/commit/2a1a7d2))

## <small>1.7.1 (2026-04-21)</small>

* fix: updating remanining usage of connectId to appId ([b03b555](https://github.com/powerhouse-inc/renown/commit/b03b555))

## 1.7.0 (2026-04-21)

* feat: support multiple apps in auth flow ([535e56b](https://github.com/powerhouse-inc/renown/commit/535e56b))

## <small>1.6.12 (2026-04-02)</small>

* fix: wait for credential indexing before redirecting back to app ([20406a5](https://github.com/powerhouse-inc/renown/commit/20406a5))

## <small>1.6.11 (2026-03-26)</small>

* fix: revert parentIdentifier — user drives don't exist yet ([9b9653a](https://github.com/powerhouse-inc/renown/commit/9b9653a))

## <small>1.6.10 (2026-03-26)</small>

* fix: pass parentIdentifier (driveId) when creating documents ([5850777](https://github.com/powerhouse-inc/renown/commit/5850777))

## <small>1.6.9 (2026-03-26)</small>

* fix: use numeric timestampUtcMs in actions (not string) ([4d669f9](https://github.com/powerhouse-inc/renown/commit/4d669f9))

## <small>1.6.8 (2026-03-26)</small>

* fix: use JSONObject type for mutateDocument actions parameter ([b49a6f6](https://github.com/powerhouse-inc/renown/commit/b49a6f6))

## <small>1.6.7 (2026-03-26)</small>

* fix: use v6 ActionInput format for mutateDocument calls ([361f6a9](https://github.com/powerhouse-inc/renown/commit/361f6a9))

## <small>1.6.6 (2026-03-25)</small>

* fix: force rebuild for v6 API changes ([b626664](https://github.com/powerhouse-inc/renown/commit/b626664))

## <small>1.6.5 (2026-03-25)</small>

* fix: create documents without parentIdentifier for now ([28335af](https://github.com/powerhouse-inc/renown/commit/28335af))

## <small>1.6.4 (2026-03-25)</small>

* fix: update GraphQL mutations to v6 reactor API ([9371c07](https://github.com/powerhouse-inc/renown/commit/9371c07))

## <small>1.6.3 (2026-03-25)</small>

* fix: pass app DID to subgraph query instead of filtering client-side ([fd60645](https://github.com/powerhouse-inc/renown/commit/fd60645))
* fix: UI credential check ([a2d5377](https://github.com/powerhouse-inc/renown/commit/a2d5377))

## <small>1.6.2 (2026-03-06)</small>

* fix: filter credentials correctly ([09f583e](https://github.com/powerhouse-inc/renown/commit/09f583e))
* ci: add Vetra container registry publishing ([1c3266f](https://github.com/powerhouse-inc/renown/commit/1c3266f))

## <small>1.6.1 (2026-01-19)</small>

* fix: use renown prod endpoint by default ([8e22fde](https://github.com/powerhouse-inc/renown/commit/8e22fde))
* chore: small console flow improvements ([14cd5f1](https://github.com/powerhouse-inc/renown/commit/14cd5f1))
* chore: updated console flow ([31596b4](https://github.com/powerhouse-inc/renown/commit/31596b4))

## 1.6.0 (2025-12-10)

* feat: added console flow login ([b09d6d7](https://github.com/powerhouse-inc/renown/commit/b09d6d7))

## 1.5.0 (2025-12-05)

* feat: added user login ([d4d0c46](https://github.com/powerhouse-inc/renown/commit/d4d0c46))

## <small>1.4.2 (2025-12-05)</small>

* fix: improved flow and profile page ([082deee](https://github.com/powerhouse-inc/renown/commit/082deee))

## <small>1.4.1 (2025-12-05)</small>

* fix: store username and image ([7472bf6](https://github.com/powerhouse-inc/renown/commit/7472bf6))

## 1.4.0 (2025-11-13)

* feat: user drives storing eip712 credentials and renown user profile ([f7d3955](https://github.com/powerhouse-inc/renown/commit/f7d3955))

## <small>1.3.5 (2025-10-21)</small>

* fix: use proper vc as renown credential payload ([b1ff6b6](https://github.com/powerhouse-inc/renown/commit/b1ff6b6))

## <small>1.3.4 (2025-10-20)</small>

* fix: renown credential creation ([1019f4d](https://github.com/powerhouse-inc/renown/commit/1019f4d))

## <small>1.3.3 (2025-10-20)</small>

* fix: api auth credential route ([3ef7cb6](https://github.com/powerhouse-inc/renown/commit/3ef7cb6))
* chore: updated dockerfile to node22 ([67500ee](https://github.com/powerhouse-inc/renown/commit/67500ee))

## <small>1.3.2 (2025-10-20)</small>

* fix: reenabled deprecated route for backward compatibility ([a0fda2b](https://github.com/powerhouse-inc/renown/commit/a0fda2b))

## <small>1.3.1 (2025-10-20)</small>

* fix: use new renown credential mutations ([afbd9c4](https://github.com/powerhouse-inc/renown/commit/afbd9c4))

## 1.3.0 (2025-10-20)

* feat: store verifiable credential ([91737a8](https://github.com/powerhouse-inc/renown/commit/91737a8))

## <small>1.2.2 (2025-10-20)</small>

* fix: updated profile graphql query ([2e0b7e5](https://github.com/powerhouse-inc/renown/commit/2e0b7e5))

## <small>1.2.1 (2025-10-20)</small>

* fix: use new renown package queries ([f4b21f7](https://github.com/powerhouse-inc/renown/commit/f4b21f7))

## 1.2.0 (2025-10-17)

* feat: sign jwts ([a504720](https://github.com/powerhouse-inc/renown/commit/a504720))

## <small>1.1.3 (2025-10-16)</small>

* fix: did jwt auth ([c292bb8](https://github.com/powerhouse-inc/renown/commit/c292bb8))

## <small>1.1.2 (2025-10-16)</small>

* fix: eth sign ([fd1e085](https://github.com/powerhouse-inc/renown/commit/fd1e085))
* fix: node version ([2b23ee0](https://github.com/powerhouse-inc/renown/commit/2b23ee0))

## <small>1.1.1 (2025-10-15)</small>

* fix: use new switchboard endpoint env var ([b97a526](https://github.com/powerhouse-inc/renown/commit/b97a526))

## 1.1.0 (2025-10-15)

* feat: added profile page ([51f43b2](https://github.com/powerhouse-inc/renown/commit/51f43b2))

## <small>1.0.1 (2025-10-15)</small>

* fix: removed public dir from dockerfile ([be18ceb](https://github.com/powerhouse-inc/renown/commit/be18ceb))
* chore: removed old workflows ([edcebde](https://github.com/powerhouse-inc/renown/commit/edcebde))

## 1.0.0 (2025-10-15)

* fix: docker build ([0a00d49](https://github.com/powerhouse-inc/renown/commit/0a00d49))
* fix: remove ceramic ([b16d1e9](https://github.com/powerhouse-inc/renown/commit/b16d1e9))
* feat: added cors headers ([9ebe73b](https://github.com/powerhouse-inc/renown/commit/9ebe73b))
* feat: added landing page style ([5032669](https://github.com/powerhouse-inc/renown/commit/5032669))
* feat: added support for ceramic node ([364ad54](https://github.com/powerhouse-inc/renown/commit/364ad54))
* feat: added support for returnUrl ([e6790dc](https://github.com/powerhouse-inc/renown/commit/e6790dc))
* feat: added support for revoking credentials ([75a5e48](https://github.com/powerhouse-inc/renown/commit/75a5e48))
* feat: added support for setting network and chain ([8ee768a](https://github.com/powerhouse-inc/renown/commit/8ee768a))
* feat: added time logging to ceramic calls ([0d28aa2](https://github.com/powerhouse-inc/renown/commit/0d28aa2))
* feat: changed credential schema to fake powerhouse url ([d96fd48](https://github.com/powerhouse-inc/renown/commit/d96fd48))
* feat: go to previous page when auth is cancelled ([011b2cf](https://github.com/powerhouse-inc/renown/commit/011b2cf))
* feat: landing page fixes ([14f013c](https://github.com/powerhouse-inc/renown/commit/14f013c))
* feat: removed attestation code ([3ef8705](https://github.com/powerhouse-inc/renown/commit/3ef8705))
* feat: support setting network in url ([cc7e2e6](https://github.com/powerhouse-inc/renown/commit/cc7e2e6))
* feat: update deps and auth dialog ([62c73ed](https://github.com/powerhouse-inc/renown/commit/62c73ed))
* feat: updated deeplink login url ([908c187](https://github.com/powerhouse-inc/renown/commit/908c187))
* feat: updated deps ([e031b19](https://github.com/powerhouse-inc/renown/commit/e031b19))
* ci: added build and deploy workflow ([81425c9](https://github.com/powerhouse-inc/renown/commit/81425c9))
* ci: added docker publish ([1abb3c7](https://github.com/powerhouse-inc/renown/commit/1abb3c7))
* chore: added build parameter ([a5be710](https://github.com/powerhouse-inc/renown/commit/a5be710))
* chore: added build params ([52f6371](https://github.com/powerhouse-inc/renown/commit/52f6371))
* chore: added env example ([08f1959](https://github.com/powerhouse-inc/renown/commit/08f1959))
* chore: deploy only on main ([6be59f3](https://github.com/powerhouse-inc/renown/commit/6be59f3))
* wip: feat: Docker build ([4a3ce34](https://github.com/powerhouse-inc/renown/commit/4a3ce34))
* add steps ([d607990](https://github.com/powerhouse-inc/renown/commit/d607990))
* Add support for private key as env variable ([e03342d](https://github.com/powerhouse-inc/renown/commit/e03342d))
* Added attestation flow ([db3d580](https://github.com/powerhouse-inc/renown/commit/db3d580))
* Added credential getter in API and added support for filtering by issuer and subject ([fb4a254](https://github.com/powerhouse-inc/renown/commit/fb4a254))
* Changed network to sepolia and added support for deeplink ([70f1148](https://github.com/powerhouse-inc/renown/commit/70f1148))
* create and store eip712 credential on ceramic ([884badf](https://github.com/powerhouse-inc/renown/commit/884badf))
* Fixed types ([dbb1ded](https://github.com/powerhouse-inc/renown/commit/dbb1ded))
* Implemented Challenge-Response auth and JWT generation ([445ccc3](https://github.com/powerhouse-inc/renown/commit/445ccc3))
* Initial commit from create-rainbowkit ([afe7c40](https://github.com/powerhouse-inc/renown/commit/afe7c40))
* Sign JWT with private key ([a338469](https://github.com/powerhouse-inc/renown/commit/a338469))
* small style fixes ([4091c89](https://github.com/powerhouse-inc/renown/commit/4091c89))
* update readme ([b2b22e2](https://github.com/powerhouse-inc/renown/commit/b2b22e2))
* Updated UI ([23dc45f](https://github.com/powerhouse-inc/renown/commit/23dc45f))
* Use siwe auth ([78ee61e](https://github.com/powerhouse-inc/renown/commit/78ee61e))
