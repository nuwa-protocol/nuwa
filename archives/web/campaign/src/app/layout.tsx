import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavigationWrapper } from "./components/navigation/NavigationWrapper";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { MobileNavProvider } from "@/app/components/navigation/MobileNavContext";
import { MessagesProvider } from "@/app/context/MessagesContext";
import { GridCardsProvider } from "@/app/context/GridCardsContext";
import { Analytics } from "@vercel/analytics/react"
import PartnerTracker from "@/app/components/shared/PartnerTracker"
import { Suspense } from "react";
import { Providers } from "./components/providers/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://campaign.nuwa.com"),
  title: {
    default: "Nuwa Campaign",
    template: "%s | Nuwa Campaign"
  },
  description: "A campaign platform for Nuwa",
  keywords: ["Nuwa", "Campaign", "Platform", "Web3"],
  authors: [{ name: "Nuwa Team" }],
  creator: "Nuwa Team",
  publisher: "Nuwa",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nuwa Campaign",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://campaign.nuwa.com",
    title: "Nuwa Campaign",
    description: "A campaign platform for Nuwa",
    siteName: "Nuwa Campaign",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nuwa Campaign",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nuwa Campaign",
    description: "A campaign platform for Nuwa",
    images: ["/og-image.png"],
    creator: "@nuwa",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const themeColor = "#000000";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/nuwa.svg" />
        <meta name="application-name" content="Nuwa Campaign" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Nuwa Campaign" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={`${inter.className} h-dvh`}>
        <Providers>
          <MobileNavProvider>
            <MessagesProvider>
              <GridCardsProvider>
                <NavigationWrapper>
                  {children}
                  <Analytics />
                  <Suspense fallback={null}>
                    <PartnerTracker />
                  </Suspense>
                </NavigationWrapper>
                <PWAInstallPrompt />
              </GridCardsProvider>
            </MessagesProvider>
          </MobileNavProvider>
        </Providers>
      </body>
    </html>
  );
}
