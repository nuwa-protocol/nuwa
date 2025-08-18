import Head from 'next/head';

interface SEOProps {
    title?: string;
    description?: string;
    keywords?: string;
    ogImage?: string;
    ogUrl?: string;
    twitterCard?: string;
    twitterImage?: string;
}

export default function SEO({
    title = 'Nuwa - Agent-as-a-Service (AaaS) for Web3',
    description = 'Nuwa is a cutting-edge Agent-as-a-Service (AaaS) platform that empowers Web3 protocols to deploy AI agents that can directly interact with on-chain smart contracts while maintaining robust security.',
    keywords = 'AI, Web3, Agent-as-a-Service, AaaS, Web3 Agent, Web3 AI, Web3 Development, Web3 Automation',
    ogImage = '/nuwa-logo-horizontal.png',
    ogUrl = 'https://nuwa.dev',
    twitterCard = 'summary_large_image',
    twitterImage = '/nuwa-logo-horizontal.png',
}: SEOProps) {
    const siteTitle = title === 'Nuwa - Agent-as-a-Service (AaaS) for Web3'
        ? title
        : `${title} | Nuwa`;

    return (
        <Head>
            {/* Basic Meta Tags */}
            <title>{siteTitle}</title>
            <meta name="description" content={description} />
            <meta name="keywords" content={keywords} />

            {/* Favicon Tags */}
            <link rel="icon" type="image/svg+xml" href="/nuwa.svg" />
            <link rel="apple-touch-icon" href="/nuwa.svg" />
            <meta name="theme-color" content="#000000" />

            {/* Open Graph Meta Tags */}
            <meta property="og:title" content={siteTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:url" content={ogUrl} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Nuwa" />

            {/* Twitter Card Meta Tags */}
            <meta name="twitter:card" content={twitterCard} />
            <meta name="twitter:title" content={siteTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={twitterImage} />
            <meta name="twitter:image:alt" content="Nuwa AI Platform" />
            <meta name="twitter:site" content="@nuwa_ai" />

            {/* Additional Meta Tags */}
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
            <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
            <meta name="robots" content="index, follow" />
            <meta name="language" content="English" />
            <link rel="canonical" href={ogUrl} />

            {/* PWA Tags */}
            <meta name="application-name" content="Nuwa" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black" />
            <meta name="apple-mobile-web-app-title" content="Nuwa" />
            <meta name="format-detection" content="telephone=no" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="msapplication-TileColor" content="#000000" />
            <meta name="msapplication-tap-highlight" content="no" />
        </Head>
    );
} 