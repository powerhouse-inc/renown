import type { NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import styles from "../../styles/Home.module.css";
import { AuthFlowLoading } from "../../components/auth/auth-flow-loading";
import { SiteLayout } from "../../components/site/site-layout";
import { withLazyWalletShell } from "../../components/wallet/lazy-wallet-shell";
import { useIsClient } from "../../hooks/useIsClient";

// The OIDC sign-in flow with the wallet stack, loaded in the browser only.
const OidcLoginFlow = withLazyWalletShell(
    () => import("../../components/auth/oidc-login-flow").then((m) => m.default),
    AuthFlowLoading,
);

const OidcLoginPage: NextPage = () => {
    const router = useRouter();
    const requestId = router.query["request"]?.toString();
    const issuer = router.query["issuer"]?.toString();
    // Statically optimised page: the query is only known once the router is ready.
    const isClient = useIsClient() && router.isReady;

    return (
        <SiteLayout variant="auth">
            <div className={styles.container}>
                <Head>
                    <title>Renown - Sign in</title>
                    <meta content="Sign in to Renown" name="description" />
                </Head>

                <div className={styles.main}>
                    {requestId && isClient ? (
                        <OidcLoginFlow requestId={requestId} issuer={issuer} />
                    ) : !requestId && isClient ? (
                        <div className="text-center text-muted-foreground">
                            <h2 className="text-2xl font-semibold mb-4">Invalid sign-in link</h2>
                            <p>
                                No sign-in request was provided. Please restart the sign-in flow
                                from the application you were using.
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>
        </SiteLayout>
    );
};

export default OidcLoginPage;
