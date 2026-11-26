import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import { AuthFlowLoading } from "../components/auth/auth-flow-loading";
import { InvalidConsoleLink } from "../components/auth/invalid-console-link";
import { SiteLayout } from "../components/site/site-layout";
import { withLazyWalletShell } from "../components/wallet/lazy-wallet-shell";
import { useIsClient } from "../hooks/useIsClient";
import { parseSessionHost, parseSessionLabel } from "../utils/console-link";
import { parseExpiresInDays } from "../utils/credential-validity";

// The CLI sign-in flow with the wallet stack, loaded in the browser only.
const ConsoleFlow = withLazyWalletShell(
    () => import("../components/auth/console-flow").then((m) => m.default),
    AuthFlowLoading,
);

const ConsolePage: NextPage = () => {
    const router = useRouter();
    const sessionId = router.query["session"]?.toString();
    const connectDid = router.query["connect"]?.toString(); // CLI's DID to authorize
    const expiresInDays = parseExpiresInDays(router.query["expiresInDays"]);
    // The session's label, signed into the credential, and the host it is for.
    const label = parseSessionLabel(router.query["app"]);
    const host = parseSessionHost(router.query["host"]);
    // Statically optimised page: the query is only known once the router is ready.
    const isClient = useIsClient() && router.isReady;

    return (
        <SiteLayout variant="auth">
            <div className={styles.container}>
                <Head>
                    <title>Renown - Console Login</title>
                    <meta content="Authorize Powerhouse CLI" name="description" />
                </Head>

                <div className={styles.main}>
                    {sessionId && isClient && (label === undefined || host === undefined) ? (
                        <InvalidConsoleLink
                            reason={
                                label === undefined
                                    ? "This link names its session in a way Renown cannot show."
                                    : "This link names a host that is not a web address."
                            }
                        />
                    ) : sessionId && isClient ? (
                        <ConsoleFlow
                            sessionId={sessionId}
                            connectDid={connectDid}
                            expiresInDays={expiresInDays}
                            label={label ?? undefined}
                            host={host ?? undefined}
                        />
                    ) : !sessionId && isClient ? (
                        <div className="text-center text-muted-foreground">
                            <h2 className="text-2xl font-semibold mb-4">Invalid Session</h2>
                            <p>No session ID provided. Please run <code className="bg-muted px-2 py-1 rounded-sm">ph login</code> from your terminal.</p>
                        </div>
                    ) : null}
                </div>
            </div>
        </SiteLayout>
    );
};

export default ConsolePage;
