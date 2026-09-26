import { createSiweMessage } from "viem/siwe";
import type { Hex } from "viem";

/** Default Renown OIDC issuer, served by the Renown switchboard. */
export const DEFAULT_OIDC_ISSUER =
    "https://switchboard.renown.vetra.io/api/@powerhousedao/renown-package/oidc";

export interface SiweTemplate {
    domain: string;
    uri: string;
    version: "1";
    nonce: string;
    issuedAt: string;
    expirationTime: string;
    statement: string;
    requestId: string;
    resources: string[];
}

export interface OidcClient {
    name: string;
    redirectHost: string;
}

export interface OidcInteraction {
    client: OidcClient;
    scope: string;
    siwe: SiweTemplate;
}

export interface OidcCompleteResult {
    redirect: string;
}

/** Thrown by `fetchInteraction`/`completeInteraction` on a non-2xx response. */
export class OidcLoginError extends Error {
    code: string;
    description?: string;

    constructor(code: string, description?: string) {
        super(description || code);
        this.name = "OidcLoginError";
        this.code = code;
        this.description = description;
    }
}

/**
 * Resolves which issuer to talk to. The `issuer` query param on the login
 * link is only trusted when it matches the built-in default or the
 * deployment's configured issuer — otherwise a crafted link could redirect
 * the signature (and the user's session) to an attacker-controlled host.
 */
export function resolveIssuer(queryIssuer?: string): string {
    const configuredIssuer = process.env.NEXT_PUBLIC_RENOWN_OIDC_ISSUER;
    if (queryIssuer && (queryIssuer === DEFAULT_OIDC_ISSUER || queryIssuer === configuredIssuer)) {
        return queryIssuer;
    }
    return configuredIssuer || DEFAULT_OIDC_ISSUER;
}

async function readErrorBody(response: Response): Promise<{ error: string; error_description?: string }> {
    try {
        const data = await response.json();
        return {
            error: typeof data?.error === "string" ? data.error : "server_error",
            error_description: typeof data?.error_description === "string" ? data.error_description : undefined,
        };
    } catch {
        return { error: "server_error" };
    }
}

/** GET `<issuer>/interaction/<id>`. Throws `OidcLoginError` on a non-2xx response. */
export async function fetchInteraction(issuer: string, id: string): Promise<OidcInteraction> {
    const response = await fetch(`${issuer}/interaction/${id}`);
    if (!response.ok) {
        const { error, error_description } = await readErrorBody(response);
        throw new OidcLoginError(error, error_description);
    }
    return response.json() as Promise<OidcInteraction>;
}

/** POST `<issuer>/interaction/<id>/complete`. Throws `OidcLoginError` on a non-2xx response. */
export async function completeInteraction(
    issuer: string,
    id: string,
    message: string,
    signature: string,
): Promise<OidcCompleteResult> {
    const response = await fetch(`${issuer}/interaction/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
    });
    if (!response.ok) {
        const { error, error_description } = await readErrorBody(response);
        throw new OidcLoginError(error, error_description);
    }
    return response.json() as Promise<OidcCompleteResult>;
}

/** Builds the EIP-4361 (SIWE) message the user signs, from the switchboard's template. */
export function buildMessage(tpl: SiweTemplate, address: Hex, chainId: number): string {
    return createSiweMessage({
        address,
        chainId,
        domain: tpl.domain,
        uri: tpl.uri,
        version: tpl.version,
        nonce: tpl.nonce,
        issuedAt: new Date(tpl.issuedAt),
        expirationTime: new Date(tpl.expirationTime),
        statement: tpl.statement,
        requestId: tpl.requestId,
        resources: tpl.resources,
    });
}
