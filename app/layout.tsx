import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AuthModalProvider } from "@/components/auth/auth-modal-provider";
import "./globals.css";

// NEXT_PUBLIC_SITE_URL must be set in Vercel env vars to the canonical domain.
// VERCEL_URL is deployment-specific (changes per deploy) — never use it for OG images.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bet-pulse.vercel.app";
const ogImage = `${siteUrl}/brand/og-image.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "PulseNow — Provably Fair Crypto Casino",
  description: "Provably Fair · Instant Withdrawals · 1% House Edge.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/brand/fav-icons/favicon.ico", sizes: "any" },
      { url: "/brand/fav-icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/fav-icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/brand/fav-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/brand/logo-icon.svg" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PulseNow",
    startupImage: "/brand/fav-icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    title: "PulseNow — Provably Fair Crypto Casino",
    description: "Provably Fair · Instant Withdrawals · 1% House Edge.",
    siteName: "PulseNow",
    images: [{ url: ogImage, width: 1200, height: 630, alt: "PulseNow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PulseNow — Provably Fair Crypto Casino",
    description: "Provably Fair · Instant Withdrawals · 1% House Edge.",
    images: [ogImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#090714",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} font-sans antialiased`}>
        {/* Register SW + capture install prompt on every page before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
              navigator.serviceWorker.getRegistrations().then(function(registrations) {
                registrations.forEach(function(registration) {
                  registration.unregister();
                });
              });
            } else {
              navigator.serviceWorker.register('/sw.js');
            }
          }
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__pwaPrompt = e;
          });
        ` }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <AuthModalProvider>{children}</AuthModalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
