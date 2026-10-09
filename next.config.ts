import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactStrictMode: false,
    output: "standalone",
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "euc.li" },
        ],
    },
    webpack: (config) => {
        config.resolve.fallback = { fs: false, net: false, tls: false };
        config.resolve.alias = {
            ...config.resolve.alias,
            "@react-native-async-storage/async-storage": false,
        };
        config.ignoreWarnings = [
            ...(config.ignoreWarnings ?? []),
            {
                module: /@privy-io\/react-auth/,
                message: /@farcaster\/mini-app-solana/,
            },
            { module: /ox\/_esm\/tempo\/internal\/virtualMasterPool/ },
        ];
        return config;
    },
    async rewrites() {
        return [
            // Stable public image URLs (pages/api/media/[documentId]/[field].ts).
            { source: "/media/:documentId/:field", destination: "/api/media/:documentId/:field" },
            // renown.id/@handle is the canonical profile URL.
            { source: "/@:handle", destination: "/profile/:handle?by=handle" },
        ];
    },
    async headers() {
        return [
            {
                source: "/api/:path*",
                headers: [
                    { key: "Access-Control-Allow-Credentials", value: "true" },
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    {
                        key: "Access-Control-Allow-Methods",
                        value: "GET,DELETE,PATCH,POST,PUT",
                    },
                    {
                        key: "Access-Control-Allow-Headers",
                        value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
