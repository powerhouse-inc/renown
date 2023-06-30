import "../styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { RainbowKitSiweNextAuthProvider } from "@rainbow-me/rainbowkit-siwe-next-auth";
import type { AppProps } from "next/app";
import { configureChains, createConfig, WagmiConfig } from "wagmi";
import { arbitrum, goerli, mainnet, optimism, polygon } from "wagmi/chains";
import { publicProvider } from "wagmi/providers/public";
import { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

const { chains, publicClient, webSocketPublicClient } = configureChains(
    [
        mainnet,
        polygon,
        optimism,
        arbitrum,
        ...(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" ? [goerli] : []),
    ],
    [publicProvider()]
);

const { connectors } = getDefaultWallets({
    appName: "RainbowKit App",
    projectId: "YOUR_PROJECT_ID",
    chains,
});

const wagmiConfig = createConfig({
    autoConnect: true,
    connectors,
    publicClient,
    webSocketPublicClient,
});

function MyApp({ Component, pageProps }: AppProps<{ session: Session }>) {
    return (
        <WagmiConfig config={wagmiConfig}>
            <SessionProvider session={pageProps.session} refetchInterval={0}>
                <RainbowKitSiweNextAuthProvider>
                    <RainbowKitProvider chains={chains}>
                        <Component {...pageProps} />
                    </RainbowKitProvider>
                </RainbowKitSiweNextAuthProvider>
            </SessionProvider>
        </WagmiConfig>
    );
}

export default MyApp;
