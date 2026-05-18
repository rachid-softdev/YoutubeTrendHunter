import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./providers";
import { CookieConsent } from "@/components/cookie-consent";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: {
    default: "TrendHunter — Veille YouTube IA",
    template: "%s | TrendHunter",
  },
  description: "Détectez les tendances YouTube émergentes avant vos concurrents. Analyse IA, alertes temps réel, extension Chrome.",
  keywords: ["YouTube", "tendances", "trends", "créateurs", "YouTube analytics", "niches YouTube"],
  authors: [{ name: "TrendHunter" }],
  creator: "TrendHunter",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: process.env.NEXTAUTH_URL,
    siteName: "TrendHunter",
    title: "TrendHunter — Veille YouTube IA",
    description: "Détectez les tendances YouTube émergentes avant vos concurrents.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrendHunter — Veille YouTube IA",
    description: "Détectez les tendances YouTube émergentes avant vos concurrents.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${roboto.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('theme')
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              })()
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-roboto bg-dark-canvas text-dark-ink">
        <PostHogProvider>
          {children}
          <CookieConsent />
        </PostHogProvider>
      </body>
    </html>
  );
}
