import "../styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import type { AppProps } from "next/app";
import { configureChains, createConfig, WagmiConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { infuraProvider } from "wagmi/providers/infura";
import { publicProvider } from "wagmi/providers/public";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

const INFURA_PROJECT_ID = process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID;
const { chains, publicClient, webSocketPublicClient } = configureChains(
    [sepolia],
    [
        INFURA_PROJECT_ID
            ? infuraProvider({ apiKey: INFURA_PROJECT_ID })
            : publicProvider(),
    ]
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
