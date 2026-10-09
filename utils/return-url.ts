/**
 * The `returnUrl` query parameter, kept only when it is an absolute http(s)
 * URL. Links like `/?connect=<did>` legitimately carry none, and a malformed
 * or non-http value must never reach `new URL(...)` or an href.
 */
export function parseReturnUrl(raw: string | string[] | undefined): string | undefined {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return undefined;
    try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:" ? value : undefined;
    } catch {
        return undefined;
    }
}
