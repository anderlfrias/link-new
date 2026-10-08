import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter } from "next/font/google";
import Script from "next/script";
import { AppProviders } from "@/providers/app-providers";
import { THEME_INIT_SCRIPT } from "@/constants/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LINK — chat para equipos",
  description: "Chat para equipos, para instalar en infraestructura propia",
  appleWebApp: {
    title: "Link",
    statusBarStyle: "black-translucent",
  },
};

// `maximumScale`/`userScalable` bloquean el pinch-zoom y el doble-tap-para-acercar —
// solo tienen efecto en touch (no afectan el zoom de escritorio, que es Ctrl+/- del
// navegador, ajeno a este meta tag), así que esto hace que la vista móvil se sienta
// como una app nativa sin restringir nada en desktop.
export const viewport: Viewport = {
  themeColor: "#0068d8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${baloo.variable}`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
