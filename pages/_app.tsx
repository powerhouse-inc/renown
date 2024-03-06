import "../styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import type { AppProps } from "next/app";
import { configureChains, createConfig, WagmiConfig } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { infuraProvider } from "wagmi/providers/infura";
import { Inter } from "next/font/google";
// import { VeramoProvider } from "@veramo-community/veramo-react";

const inter = Inter({ subsets: ["latin"] });

const { chains, publicClient, webSocketPublicClient } = configureChains(
    [mainnet, sepolia],
    [
        infuraProvider({
            apiKey: process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID || "",
        }),
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
                    {/* <VeramoProvider> */}
                    <Component {...pageProps} />
                    {/* </VeramoProvider> */}
                </RainbowKitProvider>
            </WagmiConfig>
        </main>
    );
}

export default MyApp;
