import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useAccount } from "wagmi";

const Home: NextPage = () => {
    const account = useAccount();
    const isConnected = account.isConnected;
    return (
        <div className={styles.container}>
            <Head>
                <title>Renown</title>
                <meta content="Created by Powerhouse" name="description" />
                <link href="/favicon.ico" rel="icon" />
            </Head>

            <main className={styles.main}>
                <ConnectButton />

                <div style={{ marginTop: "10vh" }}>
                    <a
                        href={`connect-dev://${account.address}`}
                        style={{
                            opacity: isConnected ? 1 : 0.3,
                            cursor: isConnected ? "pointer" : "not-allowed",
                            pointerEvents: isConnected ? "all" : "none",
                        }}
                    >
                        <h2>Open Connect</h2>
                    </a>
                </div>
            </main>
        </div>
    );
};

export default Home;
