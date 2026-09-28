import { test, expect, type Page } from "@playwright/test";
import { verifyMessage } from "viem";
import { E2E_WALLET_ADDRESS } from "../utils/wagmi-e2e";

// The page falls back to the deployment's configured issuer, then the default.
const ISSUER =
  process.env.NEXT_PUBLIC_RENOWN_OIDC_ISSUER ||
  "https://switchboard.renown.vetra.io/api/@powerhousedao/renown-package/oidc";

test.describe("OIDC login page", () => {
  test("invalid link without request id", async ({ page }) => {
    await page.goto("/oidc/login");
    await expect(page.getByText("Invalid sign-in link")).toBeVisible();
  });

  test("shows the requesting client and host", async ({ page }) => {
    await page.route(`${ISSUER}/interaction/req1`, (r) =>
      r.fulfill({
        json: {
          client: { name: "Speckle cool-frog", redirectHost: "cool-frog-speckle.vetra.io" },
          scope: "openid profile email",
          siwe: {
            domain: "localhost:3400",
            uri: ISSUER,
            version: "1",
            nonce: "abcdefgh12345678",
            issuedAt: new Date().toISOString(),
            expirationTime: new Date(Date.now() + 600000).toISOString(),
            statement: "Sign in to Speckle cool-frog with Renown.",
            requestId: "req1",
            resources: ["urn:renown-oidc:request:req1"],
          },
        },
      }),
    );
    await page.goto("/oidc/login?request=req1");
    await expect(page.getByText("Speckle cool-frog")).toBeVisible();
    await expect(page.getByText("cool-frog-speckle.vetra.io")).toBeVisible();
    await expect(page).toHaveTitle("Renown - Sign in");
  });

  test("expired request shows an error", async ({ page }) => {
    await page.route(`${ISSUER}/interaction/gone`, (r) =>
      r.fulfill({ status: 404, json: { error: "invalid_request" } }),
    );
    await page.goto("/oidc/login?request=gone");
    await expect(page.getByText(/expired|no longer valid/i)).toBeVisible();
  });

  test("ignores an untrusted issuer parameter", async ({ page }) => {
    let hitEvil = false;
    await page.route("https://evil.example/**", (r) => {
      hitEvil = true;
      return r.abort();
    });
    await page.route(`${ISSUER}/interaction/req2`, (r) =>
      r.fulfill({ status: 404, json: { error: "invalid_request" } }),
    );
    await page.goto(`/oidc/login?request=req2&issuer=${encodeURIComponent("https://evil.example/oidc")}`);
    await expect(page.getByText(/expired|no longer valid/i)).toBeVisible();
    expect(hitEvil).toBe(false);
  });

  for (const requestId of ["abc?x=1", "../../foo"]) {
    test(`keeps request id ${JSON.stringify(requestId)} inside the interaction path`, async ({ page }) => {
      const fetched: string[] = [];
      await page.route(`${new URL(ISSUER).origin}/**`, (r) => {
        fetched.push(r.request().url());
        return r.fulfill({ status: 404, json: { error: "invalid_request" } });
      });
      await page.goto(`/oidc/login?request=${encodeURIComponent(requestId)}`);
      await expect(page.getByText(/expired|no longer valid/i)).toBeVisible();
      expect(fetched).toEqual([`${ISSUER}/interaction/${encodeURIComponent(requestId)}`]);
    });
  }
});

const CLIENT_CALLBACK = "https://client.example/callback";

function mockInteraction(page: Page, requestId: string) {
  return page.route(`${ISSUER}/interaction/${requestId}`, (r) =>
    r.fulfill({
      json: {
        client: { name: "Test client", redirectHost: "client.example" },
        scope: "openid",
        siwe: {
          domain: "localhost:3400",
          uri: ISSUER,
          version: "1",
          nonce: "abcdefgh12345678",
          issuedAt: new Date().toISOString(),
          expirationTime: new Date(Date.now() + 600000).toISOString(),
          statement: "Sign in to Test client with Renown.",
          requestId,
          resources: [`urn:renown-oidc:request:${requestId}`],
        },
      },
    }),
  );
}

// Next's dev overlay opens on the hook's console.error and covers the page.
function hideDevOverlay(page: Page) {
  return page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

// Signs through wagmi's mock connector, which forwards to the anvil node
// started by playwright.config.ts.
test.describe("OIDC login page with a connected wallet", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__e2eWallet = { defaultConnected: true, reconnect: true };
    });
  });

  test("a rejected signature stays retryable", async ({ page }) => {
    await mockInteraction(page, "req-retry");
    let completeBody: { message: string; signature: `0x${string}` } | undefined;
    await page.route(`${ISSUER}/interaction/req-retry/complete`, (r) => {
      completeBody = r.request().postDataJSON();
      return r.fulfill({ json: { redirect: CLIENT_CALLBACK } });
    });
    await page.route(`${CLIENT_CALLBACK}*`, (r) => r.fulfill({ body: "done" }));

    await page.goto("/oidc/login?request=req-retry");
    await hideDevOverlay(page);
    const continueButton = page.getByRole("button", { name: /^Continue as 0xf39F/ });
    await page.evaluate(() => {
      window.__e2eWallet!.signMessageError = true;
    });
    await continueButton.click();
    await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
    await expect(continueButton).toBeEnabled();

    await page.evaluate(() => {
      window.__e2eWallet!.signMessageError = false;
    });
    await continueButton.click();
    await page.waitForURL(CLIENT_CALLBACK);
    expect(completeBody).toBeDefined();
    const valid = await verifyMessage({
      address: E2E_WALLET_ADDRESS,
      message: completeBody!.message,
      signature: completeBody!.signature,
    });
    expect(valid).toBe(true);
  });

  test("keeps the button disabled while redirecting", async ({ page }) => {
    await mockInteraction(page, "req-redirect");
    let completeCalls = 0;
    // A hash redirect keeps the document alive (a real one would unload it),
    // so the button's state after `location.assign` stays observable.
    const redirect = "http://localhost:3400/oidc/login?request=req-redirect#redirected";
    await page.route(`${ISSUER}/interaction/req-redirect/complete`, (r) => {
      completeCalls++;
      return r.fulfill({ json: { redirect } });
    });

    await page.goto("/oidc/login?request=req-redirect");
    await page.getByRole("button", { name: /^Continue as 0xf39F/ }).click();
    await page.waitForURL(redirect);

    // Give the old code's `finally` time to re-enable the button.
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Signing…" })).toBeDisabled();
    expect(completeCalls).toBe(1);
  });
});
