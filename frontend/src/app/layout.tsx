import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter } from "next/font/google";
import Script from "next/script";
import { AppProviders } from "@/providers/app-providers";
import { THEME_STORAGE_KEY } from "@/constants/theme";
import "./globals.css";

// Corre antes de hidratar para evitar el flash de tema incorrecto (debe usar la misma
// key que THEME_STORAGE_KEY en providers/theme-provider.tsx).
const THEME_INIT_SCRIPT = `
  try {
    if (localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Link — Chat Interno",
  description: "Chat interno de la organización",
  appleWebApp: {
    title: "Link",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0068d8",
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
