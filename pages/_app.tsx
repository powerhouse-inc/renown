import "../styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import type { AppProps } from "next/app";
import { configureChains, createConfig, WagmiConfig } from "wagmi";
import { baseGoerli } from "wagmi/chains";
import { publicProvider } from "wagmi/providers/public";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

const { chains, publicClient, webSocketPublicClient } = configureChains(
    [baseGoerli],
    [publicProvider()]
);

const { connectors } = getDefaultWallets({
    appName: "Renown",
    projectId: process.env.NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID || "",
    chains,
});

const wagmiConfig = createConfig({
    autoConnect: true,
    connectors,
    publicClient,
    webSocketPublicClient,
});

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <main className={inter.className}>
            <WagmiConfig config={wagmiConfig}>
                <RainbowKitProvider chains={chains}>
                    <Component {...pageProps} />
                </RainbowKitProvider>
            </WagmiConfig>
        </main>
    );
}

export default MyApp;
