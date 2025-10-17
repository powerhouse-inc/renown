import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import Connect from "../components/connect-flow";
import { useEffect, useState } from "react";
import PageBackground from "../components/page-background";

const Home: NextPage = () => {
    const router = useRouter();
    const connectId = router.query["connect"]?.toString();
    const deeplink = router.query["deeplink"]?.toString();
    const returnUrl = router.query["returnUrl"]?.toString();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(typeof indexedDB !== "undefined");
    }, []);

    return (
        <PageBackground>
            <div className={styles.container}>
                <Head>
                    <title>Renown</title>
                    <meta content="Created by Powerhouse" name="description" />
                    <link href="/favicon.ico" rel="icon" />
                </Head>

                <main className={styles.main}>
                    {connectId && isClient && (
                        <Connect
                            connectId={connectId}
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
