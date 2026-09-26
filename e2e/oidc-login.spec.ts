import { test, expect } from "@playwright/test";

const ISSUER = "https://switchboard.renown.vetra.io/api/@powerhousedao/renown-package/oidc";

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
            domain: "localhost:3000",
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
});
