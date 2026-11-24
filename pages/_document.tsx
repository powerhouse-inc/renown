import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
            </Head>
            <body>
                <Main />
                <NextScript />
                {/* The deployment's settings, read when its server started, before
                    the app runs; it also loads Umami unless analytics is off
                    (lib/runtime-config.ts). */}
                <Script src="/api/runtime-config" strategy="beforeInteractive" />
            </body>
        </Html>
    );
}
