import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import {WebFlow} from "../components/auth/web-flow";
import PageBackground from "../components/ui/page-background";
import { useIsClient } from "../hooks/useIsClient";
import { parseExpiresInDays } from "../utils/credential-validity";
import { parseReturnUrl } from "../utils/return-url";

const Home: NextPage = () => {
    const router = useRouter();
    const connectId = router.query["connect"]?.toString();
    const appId = router.query["app"]?.toString() || connectId;
    const deeplink = router.query["deeplink"]?.toString();
    const returnUrl = parseReturnUrl(router.query["returnUrl"]);
    const expiresInDays = parseExpiresInDays(router.query["expiresInDays"]);
    const isClient = useIsClient();

    const inAuthFlow = Boolean(appId) && isClient;

    return (
        <PageBackground hideLoginButton={inAuthFlow}>
            <div className={styles.container}>
                <Head>
                    <title>Renown</title>
                    <meta content="Created by Powerhouse" name="description" />
                </Head>

                <main className={styles.main}>
                    {appId && isClient && (
                        <WebFlow
                            appId={appId}
                            deeplink={deeplink}
                            returnUrl={returnUrl}
                            expiresInDays={expiresInDays}
                        />
                    )}
                </main>
            </div>
        </PageBackground>
    );
};

export default Home;
