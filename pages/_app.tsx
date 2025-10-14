import "../styles/globals.css";
import type { AppProps } from "next/app";
import { createConfig, WagmiProvider, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { Inter } from "next/font/google";
import { getChain } from "../utils/viem";
import { useRef } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const inter = Inter({ subsets: ["latin"] });

// Suppress known Next.js 13.5.11 + React 18.3 fetchPriority warning
const originalError = console.error;
console.error = (...args) => {
    if (
        typeof args[0] === 'string' &&
        args[0].includes('React does not recognize the `fetchPriority` prop')
    ) {
        return;
    }
    originalError.apply(console, args);
};

const INFURA_PROJECT_ID = process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID;

const queryClient = new QueryClient();

// Cache wagmi configs to prevent multiple WalletConnect initializations
const wagmiConfigCache = new Map<string, ReturnType<typeof createConfig>>();

function initWagmi(networkId: string, chainId: string) {
    const cacheKey = `${networkId}-${chainId}`;
    
    // Return cached config if it exists
    if (wagmiConfigCache.has(cacheKey)) {
        return wagmiConfigCache.get(cacheKey)!;
    }

    if (networkId !== "eip155") {
        throw new Error(
            `Network '${networkId}' is not supported. Supported networks: eip155`
        );
    }

    const id = parseInt(chainId);
    const chain = getChain(id);
    if (!chain) {
        throw new Error(`Chain with id '${chainId}' found`);
    }

    const wagmiConfig = createConfig({
        chains: [chain],
        connectors: [
            injected(),
            walletConnect({
                projectId: process.env.NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID || "",
                showQrModal: false,
            }),
        ],
        transports: {
            [chain.id]: http(
                INFURA_PROJECT_ID
                    ? `https://${chain.name.toLowerCase().replace(/\s+/g, '-')}.infura.io/v3/${INFURA_PROJECT_ID}`
                    : undefined
            ),
        },
    });

    // Cache the config
    wagmiConfigCache.set(cacheKey, wagmiConfig);
    return wagmiConfig;
}

function MyApp({ Component, pageProps, router }: AppProps) {
    const networkId = router.query["network"]?.toString() ?? "eip155";
    const chainId = router.query["chain"]?.toString() ?? "1";
    const configRef = useRef<ReturnType<typeof createConfig> | null>(null);
    
    // Only create config once per network/chain combination
    if (!configRef.current) {
        configRef.current = initWagmi(networkId, chainId);
    }
    
    return (
        <main className={inter.className}>
            <WagmiProvider config={configRef.current}>
                <QueryClientProvider client={queryClient}>
                    <RainbowKitProvider>
                        <Component {...pageProps} />
                    </RainbowKitProvider>
                </QueryClientProvider>
            </WagmiProvider>
        </main>
    );
}

export default MyApp;
