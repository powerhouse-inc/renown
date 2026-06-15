import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import {WebFlow} from "../components/auth/web-flow";
import PageBackground from "../components/ui/page-background";
import { useIsClient } from "../hooks/useIsClient";

const Home: NextPage = () => {
    const router = useRouter();
    const connectId = router.query["connect"]?.toString();
    const appId = router.query["app"]?.toString() || connectId;
    const deeplink = router.query["deeplink"]?.toString();
    const returnUrl = router.query["returnUrl"]?.toString();
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
                        />
                    )}
                </main>
            </div>
        </PageBackground>
    );
};

export default Home;
