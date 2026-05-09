import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider"
import { LangProvider } from "@/lib/i18n/context";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Legjobbkocsma",
  description: "Multi-venue reservation operations admin",
  icons: {
    icon: '/lklogo.png',
  },
  // Internal admin tool — do not surface in search engines.
  robots: { index: false, follow: false },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  // Hungarian uses ő/ű which fall outside the basic latin subset on some
  // systems.  Including latin-ext keeps the font from falling back to a
  // different glyph family for those characters.
  subsets: ["latin", "latin-ext"],
});

// Note: <html lang> stays static at render time because reading the cookie
// here would mark the layout as dynamic and conflict with Next 16
// cacheComponents.  The actual rendered lang is synced client-side from
// LangProvider via a `document.documentElement.lang` effect — screen
// readers and translation extensions then key off the live attribute.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          // Honour the user's system preference; the toggle still lets
          // them override.  `defaultTheme="dark"` would force dark on
          // every device regardless of system setting.
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <LangProvider>
              {children}
              <Toaster />
            </LangProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
