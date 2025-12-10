import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import ConsoleFlow from "../components/console-flow";
import { useEffect, useState } from "react";
import PageBackground from "../components/page-background";

const ConsolePage: NextPage = () => {
    const router = useRouter();
    const sessionId = router.query["session"]?.toString();
    const connectDid = router.query["connect"]?.toString(); // CLI's DID to authorize
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(typeof indexedDB !== "undefined");
    }, []);

    return (
        <PageBackground>
            <div className={styles.container}>
                <Head>
                    <title>Renown - Console Login</title>
                    <meta content="Authorize Powerhouse CLI" name="description" />
                    <link href="/favicon.ico" rel="icon" />
                </Head>

                <main className={styles.main}>
                    {sessionId && isClient ? (
                        <ConsoleFlow sessionId={sessionId} connectDid={connectDid} />
                    ) : !sessionId && isClient ? (
                        <div className="text-center text-neutral-4">
                            <h2 className="text-2xl font-semibold mb-4">Invalid Session</h2>
                            <p>No session ID provided. Please run <code className="bg-neutral-2 px-2 py-1 rounded">ph login</code> from your terminal.</p>
                        </div>
                    ) : null}
                </main>
            </div>
        </PageBackground>
    );
};

export default ConsolePage;
