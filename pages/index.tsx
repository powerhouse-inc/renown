import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import Connect from "../components/connect-flow";
import { useEffect, useState } from "react";

const Home: NextPage = () => {
    const router = useRouter();
    const connectId = router.query["connect"]?.toString();
    const deeplink = router.query["deeplink"]?.toString();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(typeof indexedDB !== "undefined");
    }, []);

    return (
        <div className={styles.container}>
            <Head>
                <title>Renown</title>
                <meta content="Created by Powerhouse" name="description" />
                <link href="/favicon.ico" rel="icon" />
            </Head>

            <main className={styles.main}>
                {connectId && isClient && (
                    <Connect connectId={connectId} deeplink={deeplink} />
                )}
            </main>
        </div>
    );
};

export default Home;
