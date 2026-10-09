import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import ConsoleFlow from "../components/auth/console-flow";
import { SiteLayout } from "../components/site/site-layout";
import { useIsClient } from "../hooks/useIsClient";
import { parseExpiresInDays } from "../utils/credential-validity";

const ConsolePage: NextPage = () => {
    const router = useRouter();
    const sessionId = router.query["session"]?.toString();
    const connectDid = router.query["connect"]?.toString(); // CLI's DID to authorize
    const expiresInDays = parseExpiresInDays(router.query["expiresInDays"]);
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
                    {sessionId && isClient ? (
                        <ConsoleFlow sessionId={sessionId} connectDid={connectDid} expiresInDays={expiresInDays} />
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
