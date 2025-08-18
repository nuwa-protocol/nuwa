import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: "summary" | "summary_large_image";
}

export const SEO = ({
  title,
  description = "Nuwa - The Web3 AI Agent Platform. Experience the future of autonomous AI agents on blockchain, managing crypto assets and executing on-chain operations.",
  keywords = "AI, Web3, Agent, Crypto, Nuwa, Blockchain, Autonomous AI, DeFi, Smart Contracts, Move, Rooch",
  ogImage = "/nuwa-logo-horizontal.svg",
  ogUrl = "https://nuwa.dev",
  twitterCard = "summary_large_image",
}: SEOProps) => {
  const fullTitle = `${title} | Nuwa - The Web3 AI Agent Platform`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="Nuwa" />
      <meta name="theme-color" content="#ffffff" />
      <meta name="robots" content="index, follow" />
      <meta name="language" content="English" />
      <meta name="revisit-after" content="7 days" />
      <meta name="generator" content="Nuwa Platform" />
      <link rel="canonical" href={ogUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={ogUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="Nuwa" />

      {/* Twitter */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:url" content={ogUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:creator" content="@nuwa" />

      {/* Schema.org markup for Google */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Nuwa",
          description: description,
          url: ogUrl,
          applicationCategory: "Web3 Application",
          operatingSystem: "Web-based",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        })}
      </script>
    </Helmet>
  );
};
