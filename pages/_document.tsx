import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
                {/* Umami analytics (self-hosted). The same build is served at
                    renown.vetra.io and (Vercel) www.renown.id; data-domains
                    counts both and nothing else (previews, local dev). */}
                <script
                    defer
                    src="https://umami.monitoring.vetra.io/script.js"
                    data-website-id="c5102484-ab3d-4c46-9198-0fbe81f27789"
                    data-domains="renown.vetra.io,www.renown.id"
                />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
