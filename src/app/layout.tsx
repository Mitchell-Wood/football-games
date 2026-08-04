import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Football Games",
  description: "A hub of daily football guessing games — starting with Career Path.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg tracking-tight">
              ⚽ Football Games
            </Link>
            <nav className="text-sm text-black/60 dark:text-white/60 flex gap-4">
              <Link href="/career-path" className="hover:text-current">
                Career Path
              </Link>
              <Link href="/guess-the-player" className="hover:text-current">
                Guess the Player
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/10 dark:border-white/10">
          <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-black/50 dark:text-white/50">
            Player data sourced via{" "}
            <a
              href="https://github.com/felipeall/transfermarkt-api"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              transfermarkt-api
            </a>
            . Not affiliated with Transfermarkt.
          </div>
        </footer>
      </body>
    </html>
  );
}
